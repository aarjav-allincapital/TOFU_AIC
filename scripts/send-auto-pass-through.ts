/**
 * Send auto-pass reject emails through a date (excludes manual Pass).
 *
 *   THROUGH=2026-08-26 npx tsx scripts/send-auto-pass-through.ts
 *   AFTER_COMPANY="AyuNexis Private Limited" THROUGH=2026-08-26 npx tsx scripts/send-auto-pass-through.ts
 *   DRY_RUN=1 …
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const REJECT_SENT_MARK = "|reject-sent";
// Never email: portfolio (Returns) and our own mailboxes (forwards land as rows).
const EXCLUDED_DOMAINS = new Set(["returns.trade", "allincapital.vc"]);
const EXCLUDED_EMAILS = new Set(["shivam@returns.trade"]);
// Buckets that mean a human is actively engaging the founder. Any company or
// sender that ALSO has a row in one of these must never get a pass email,
// even if a second row for them was auto-passed.
const ACTIVE_BUCKETS = ["request_info"]; // + every call_with_* (prefix match)
const MS_24H = 24 * 60 * 60 * 1000;

function normCompany(s: unknown): string {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function parseThroughEndMs(raw: string): number {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`THROUGH must be YYYY-MM-DD, got ${raw}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return Date.UTC(y, mo, d, 23, 59, 59, 999);
}

function buildPassEmail(founderName: string, owner: string) {
  const name = founderName.trim() || "there";
  const isAditya = owner === "aditya";

  const signoffText = isAditya ? "\n\nRegards,\nAditya" : "";
  const signoffHtml = isAditya
    ? "<p>Regards,<br/><strong>Aditya</strong></p>"
    : "";
  const superdmText = isAditya
    ? ""
    : `\n\nYou are welcome to reach out again at https://superdm.com/kushal in a few weeks or months if you feel you have changed direction or have much more traction.`;
  const superdmHtml = isAditya
    ? ""
    : `<p>You are welcome to reach out again at <a href="https://superdm.com/kushal" style="color:#111827;font-weight:600;">https://superdm.com/kushal</a> in a few weeks or months if you feel you have changed direction or have much more traction.</p>`;

  const text = `Hey ${name},

Thanks for reaching out to us.  We wanted to let you know that at this point, we're not able to move forward with your startup for an investment.

Given the volume of inbounds we get , it's not possible for us to give personalised feedback on why we are passing. However in most cases the reasons come down to relevance to our current themes of interest or overall clarity in the pitch or the execution that the founder has demonstrated.

If you'd like to be reconsidered, the best path is through a referral from someone in our portfolio or founder network.${superdmText}

Thanks again for applying, and we wish you all the best on your journey.${signoffText}`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p>Hey ${escapeHtml(name)},</p>
<p>Thanks for reaching out to us.&nbsp;&nbsp;We wanted to let you know that at this point, we're not able to move forward with your startup for an investment.</p>
<p>Given the volume of inbounds we get , it's not possible for us to give personalised feedback on why we are passing. However in most cases the reasons come down to relevance to our current themes of interest or overall clarity in the pitch or the execution that the founder has demonstrated.</p>
<p>If you'd like to be reconsidered, the best path is through a referral from someone in our portfolio or founder network.</p>
${superdmHtml}
<p>Thanks again for applying, and we wish you all the best on your journey.</p>
${signoffHtml}
</div>`;

  return { text, html };
}

async function sendPassRejectEmail(founderEmail: string, founderName: string, owner: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY missing");

  const isAditya = owner === "aditya";

  const from = isAditya
    ? (process.env.RESEND_FROM_ADITYA || "Aditya Singh <adityasingh@allincapital.vc>")
    : (process.env.RESEND_FROM_CALL || process.env.RESEND_FROM_TEAM || "All In Capital <team@allincapital.vc>");

  const replyTo = isAditya
    ? (process.env.ADITYA_REPLY_TO || "adityasingh@allincapital.vc")
    : (process.env.KUSHAL_REPLY_TO || process.env.RESEND_REPLY_TO || "response@allincapital.vc");

  const { text, html } = buildPassEmail(founderName, owner);

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: founderEmail,
    replyTo,
    subject: `Update on your application — All In Capital`,
    html,
    text,
  });
  if (result.error) {
    throw new Error(result.error.message || "Resend rejected the email.");
  }
}

async function main() {
  const through = process.env.THROUGH || "2026-08-26";
  const afterCompany = (process.env.AFTER_COMPANY || "").trim();
  const afterRow = process.env.AFTER_ROW ? Number(process.env.AFTER_ROW) : 0;
  const dry = process.env.DRY_RUN === "1";
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : 500;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const throughMs = parseThroughEndMs(through);
  const cutoff24h = Date.now() - MS_24H;
  const endMs = Math.min(throughMs, cutoff24h);

  let afterMs = 0;
  if (afterRow > 0) {
    // Precise resume point: everything received AFTER this exact row.
    const { data: anchor, error: aErr } = await admin
      .from("deals")
      .select("row_index, company, date_received_ms, date_received")
      .eq("row_index", afterRow)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!anchor?.date_received_ms) {
      throw new Error(`AFTER_ROW not found: ${afterRow}`);
    }
    afterMs = anchor.date_received_ms as number;
    console.log(
      `Anchor after row ${anchor.row_index} ${anchor.company} (${anchor.date_received})`,
    );
  } else if (afterCompany) {
    const { data: anchor, error: aErr } = await admin
      .from("deals")
      .select("row_index, company, date_received_ms, date_received")
      .ilike("company", afterCompany)
      .order("date_received_ms", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (aErr) throw new Error(aErr.message);
    if (!anchor?.date_received_ms) {
      throw new Error(`AFTER_COMPANY not found: ${afterCompany}`);
    }
    afterMs = anchor.date_received_ms as number;
    console.log(
      `Anchor after ${anchor.company} row ${anchor.row_index} (${anchor.date_received})`,
    );
  }

  console.log(
    `Auto-pass rejects` +
      (afterMs ? ` after ms>${afterMs}` : "") +
      ` through ${through} (end=${new Date(endMs).toISOString()})` +
      ` · system:auto-pass only · skip already-sent` +
      (dry ? " · DRY RUN" : ""),
  );

  let query = admin
    .from("deals")
    .select(
      "row_index, company, name, sender_email, date_received_ms, date_received, manual_bucket, manual_bucket_by, owner",
    )
    .eq("manual_bucket", "pass")
    .like("manual_bucket_by", "system:auto-pass%")
    .lte("date_received_ms", endMs)
    .order("date_received_ms", { ascending: true })
    .limit(Math.max(limit * 3, 300));

  if (afterMs > 0) {
    query = query.gt("date_received_ms", afterMs);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Companies / senders a human is actively engaging (In Review or Meeting).
  const { data: activeRows, error: activeErr } = await admin
    .from("deals")
    .select("row_index, company, sender_email, manual_bucket")
    .or(
      [
        ...ACTIVE_BUCKETS.map((b) => `manual_bucket.eq.${b}`),
        "manual_bucket.like.call_with_%",
      ].join(","),
    );
  if (activeErr) throw new Error(activeErr.message);
  const activeCompanies = new Set<string>();
  const activeEmails = new Set<string>();
  for (const a of activeRows || []) {
    const c = normCompany(a.company);
    if (c && c !== "unknown" && c !== "unnamed") activeCompanies.add(c);
    const e = String(a.sender_email || "").trim().toLowerCase();
    if (e.includes("@")) activeEmails.add(e);
  }
  console.log(
    `Active-engagement guard: ${(activeRows || []).length} In Review / Meeting rows → ${activeCompanies.size} companies, ${activeEmails.size} emails protected`,
  );

  const skippedActive: string[] = [];
  const targets = (data || [])
    .filter((r) => {
      const by = String(r.manual_bucket_by || "");
      if (!by.startsWith("system:auto-pass")) return false;
      if (by.includes(REJECT_SENT_MARK)) return false;
      const email = String(r.sender_email || "")
        .trim()
        .toLowerCase();
      if (!email.includes("@")) return false;
      if (EXCLUDED_EMAILS.has(email)) return false;
      if (EXCLUDED_DOMAINS.has(emailDomain(email))) return false;
      const company = normCompany(r.company);
      if (activeEmails.has(email) || (company && activeCompanies.has(company))) {
        skippedActive.push(`row ${r.row_index} ${r.company} <${email}>`);
        return false;
      }
      return true;
    })
    .slice(0, limit);

  if (skippedActive.length) {
    console.log(`Skipped (company/founder is In Review or Meeting): ${skippedActive.length}`);
    skippedActive.forEach((s) => console.log(`  ⛔ ${s}`));
  }

  console.log(`Fetched: ${(data || []).length} · to email: ${targets.length}`);
  if (targets.length > 0) {
    const first = targets[0]!;
    const last = targets[targets.length - 1]!;
    console.log(
      `  first: row ${first.row_index} ${first.company} (${first.date_received})`,
    );
    console.log(
      `  last:  row ${last.row_index} ${last.company} (${last.date_received})`,
    );
  }

  let sent = 0;
  let failed = 0;
  let adityaCount = 0;
  let teamCount = 0;
  for (const r of targets) {
    const name = String(r.name || "").trim();
    const email = String(r.sender_email || "").trim();
    const owner = String((r as Record<string, unknown>).owner || "").trim();
    const via = owner === "aditya" ? "aditya" : "team";
    console.log(
      `  ${dry ? "would send" : "sending"} [${via}] → ${name || "?"} <${email}> (${r.company})`,
    );
    if (via === "aditya") adityaCount++; else teamCount++;
    if (dry) {
      sent += 1;
      continue;
    }
    try {
      await sendPassRejectEmail(email, name, owner);
      const stampedBy = `${String(r.manual_bucket_by || "system:auto-pass").replace(REJECT_SENT_MARK, "")}${REJECT_SENT_MARK}`;
      await admin
        .from("deals")
        .update({ manual_bucket_by: stampedBy })
        .eq("row_index", r.row_index as number);
      sent += 1;
      await new Promise((res) => setTimeout(res, 400));
    } catch (err) {
      failed += 1;
      console.warn(
        `  fail row ${r.row_index}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`✓ done sent=${sent} failed=${failed} (aditya=${adityaCount} team=${teamCount})`);
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
