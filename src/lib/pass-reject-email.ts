import "server-only";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin-core";
import { shouldBlockOutboundFounderEmail } from "@/lib/outbound-email-guard";
import { sendPassRejectEmail } from "@/lib/resend";

const REJECT_SENT_MARK = "|reject-sent";

function alreadyMarked(row: {
  reject_email_sent_at?: string | null;
  manual_bucket_by?: string | null;
} | null): boolean {
  if (!row) return false;
  if (row.reject_email_sent_at) return true;
  return String(row.manual_bucket_by || "").includes(REJECT_SENT_MARK);
}

/**
 * Send the Pass reject note to the founder.
 * @param force — human Pass override: send even if we already mailed (and
 *   ignore the 24h auto-pass delay). Cron must leave force unset.
 */
export async function sendPassRejectIfNeeded(opts: {
  rowIndex: number;
  founderEmail?: string | null;
  founderName?: string | null;
  force?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!isSupabaseAdminConfigured) {
    return { sent: false, reason: "supabase_not_configured" };
  }

  const admin = getSupabaseAdminCore();

  let row: {
    name?: string | null;
    sender_email?: string | null;
    manual_bucket_by?: string | null;
    reject_email_sent_at?: string | null;
  } | null = null;

  {
    const full = await admin
      .from("deals")
      .select("name, sender_email, manual_bucket_by, reject_email_sent_at")
      .eq("row_index", opts.rowIndex)
      .maybeSingle();
    if (full.error && /reject_email_sent_at/i.test(full.error.message)) {
      const basic = await admin
        .from("deals")
        .select("name, sender_email, manual_bucket_by")
        .eq("row_index", opts.rowIndex)
        .maybeSingle();
      if (basic.error) {
        return { sent: false, reason: basic.error.message };
      }
      row = basic.data;
    } else if (full.error) {
      return { sent: false, reason: full.error.message };
    } else {
      row = full.data;
    }
  }

  if (!opts.force && alreadyMarked(row)) {
    return { sent: false, reason: "already_sent" };
  }

  const email = (
    opts.founderEmail ||
    row?.sender_email ||
    ""
  )
    .trim()
    .toLowerCase();
  if (!email.includes("@")) {
    return { sent: false, reason: "no_email" };
  }

  // Portfolio / non-inbound: never mail (e.g. Shivam @ Returns).
  // Stamp |reject-sent so cron / force Pass won't keep retrying.
  if (shouldBlockOutboundFounderEmail(email)) {
    const baseBy = String(row?.manual_bucket_by || "system:pass").replace(
      new RegExp(`\\${REJECT_SENT_MARK}`, "g"),
      "",
    );
    const stampedBy = `${baseBy || "system:pass"}${REJECT_SENT_MARK}`;
    await admin
      .from("deals")
      .update({ manual_bucket_by: stampedBy })
      .eq("row_index", opts.rowIndex);
    return { sent: false, reason: "blocked" };
  }

  const name = (opts.founderName || row?.name || "").trim();

  try {
    await sendPassRejectEmail({ founderEmail: email, founderName: name });
  } catch (err) {
    console.warn(
      `[pass-reject] email failed for row ${opts.rowIndex}:`,
      err instanceof Error ? err.message : err,
    );
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "send_failed",
    };
  }

  const now = new Date().toISOString();
  const baseBy = String(row?.manual_bucket_by || "system:pass").replace(
    new RegExp(`\\${REJECT_SENT_MARK}`, "g"),
    "",
  );
  const stampedBy = `${baseBy || "system:pass"}${REJECT_SENT_MARK}`;

  const withCol = await admin
    .from("deals")
    .update({
      reject_email_sent_at: now,
      manual_bucket_by: stampedBy,
    })
    .eq("row_index", opts.rowIndex);

  if (withCol.error && /reject_email_sent_at/i.test(withCol.error.message)) {
    await admin
      .from("deals")
      .update({ manual_bucket_by: stampedBy })
      .eq("row_index", opts.rowIndex);
  } else if (withCol.error) {
    console.warn(
      `[pass-reject] stamp failed for row ${opts.rowIndex}:`,
      withCol.error.message,
    );
  }

  return { sent: true };
}

const MS_24H = 24 * 60 * 60 * 1000;

export type DuePassRejectResult = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
};

/**
 * Daily cron: email auto-passed founders once their inbound is ≥24h old.
 * Only `system:auto-pass` deals — manual Pass still emails immediately from
 * the bucket API. Deduped via |reject-sent / reject_email_sent_at.
 */
export async function sendDueAutoPassRejectEmails(
  limit = 100,
): Promise<DuePassRejectResult> {
  if (!isSupabaseAdminConfigured) {
    return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const admin = getSupabaseAdminCore();
  const cutoffMs = Date.now() - MS_24H;

  const { data, error } = await admin
    .from("deals")
    .select(
      "row_index, name, sender_email, date_received_ms, manual_bucket_at, manual_bucket_by, first_seen_at",
    )
    .eq("manual_bucket", "pass")
    .like("manual_bucket_by", "system:auto-pass%")
    .order("date_received_ms", { ascending: true })
    .limit(Math.max(limit * 3, 150));

  if (error) {
    console.warn("[pass-reject] due query failed:", error.message);
    return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const due = (data || []).filter((r) => {
    if (alreadyMarked(r)) return false;
    if (!String(r.sender_email || "").includes("@")) return false;
    const receivedMs =
      typeof r.date_received_ms === "number" && r.date_received_ms > 0
        ? r.date_received_ms
        : r.manual_bucket_at
          ? new Date(r.manual_bucket_at).getTime()
          : r.first_seen_at
            ? new Date(r.first_seen_at).getTime()
            : 0;
    return receivedMs > 0 && receivedMs <= cutoffMs;
  });

  const batch = due.slice(0, limit);
  let sent = 0;
  let failed = 0;
  let skipped = (data || []).length - batch.length;

  for (const r of batch) {
    const result = await sendPassRejectIfNeeded({
      rowIndex: r.row_index as number,
      founderEmail: r.sender_email,
      founderName: r.name,
    });
    if (result.sent) {
      sent += 1;
      await new Promise((res) => setTimeout(res, 350));
    } else if (result.reason === "already_sent" || result.reason === "no_email" || result.reason === "blocked") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return { attempted: batch.length, sent, skipped, failed };
}
