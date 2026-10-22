/**
 * Pass notes for Aditya-tagged deals that are 0-star or have no stars.
 * Sent from Aditya's mailbox. Skips meetings, request-info, and anything already mailed.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

function isMeeting(d: {
  manual_bucket: string | null;
  status: string | null;
  action: string | null;
}) {
  const bucket = (d.manual_bucket || "").trim().toLowerCase();
  if (bucket.startsWith("call_with_")) return true;
  const text = `${d.status || ""} ${d.action || ""}`.toLowerCase().trim();
  return /\bmet\b|meeting|call\b/.test(text);
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { sendPassRejectEmailFromAditya } = await import("../src/lib/resend");
  const { shouldBlockOutboundFounderEmail } = await import(
    "../src/lib/outbound-email-guard"
  );
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await admin
    .from("deals")
    .select(
      "row_index, company, name, sender_email, owner, ai_rating_stars, manual_bucket, manual_bucket_by, status, action",
    )
    .eq("owner", "aditya")
    .or("ai_rating_stars.eq.0,ai_rating_stars.is.null")
    .order("row_index");
  if (error) throw new Error(error.message);

  const rows = (data || []).filter((d) => {
    if (isMeeting(d)) return false;
    const bucket = (d.manual_bucket || "").trim().toLowerCase();
    if (bucket === "request_info") return false;
    if (bucket.startsWith("call_with_")) return false;
    if (String(d.manual_bucket_by || "").includes("reject-sent")) return false;
    return true;
  });

  const seen = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  const stamp = async (rowIndex: number, by: string | null) => {
    const base = String(by || "system:auto-pass").replace(/\|reject-sent/g, "");
    await admin
      .from("deals")
      .update({
        manual_bucket: "pass_by_aditya",
        manual_bucket_by: `${base}|reject-sent`,
      })
      .eq("row_index", rowIndex);
  };

  for (const d of rows) {
    const email = String(d.sender_email || "").trim().toLowerCase();
    if (email && seen.has(email)) {
      await stamp(d.row_index, d.manual_bucket_by);
      skipped += 1;
      console.log("dup", d.row_index, d.company);
      continue;
    }
    if (email) seen.add(email);
    if (!email.includes("@")) {
      skipped += 1;
      console.log("skip", d.row_index, d.company || d.name, "no_email");
      continue;
    }
    if (shouldBlockOutboundFounderEmail(email)) {
      await stamp(d.row_index, d.manual_bucket_by);
      skipped += 1;
      console.log("skip", d.row_index, d.company || d.name, "blocked");
      continue;
    }
    try {
      await sendPassRejectEmailFromAditya({
        founderEmail: email,
        founderName: String(d.name || ""),
      });
      await stamp(d.row_index, d.manual_bucket_by);
      sent += 1;
      console.log("sent-aditya", d.row_index, d.company || d.name, d.ai_rating_stars ?? "no-star");
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      failed += 1;
      const reason = err instanceof Error ? err.message : "send_failed";
      failures.push(`${d.row_index} ${d.company}: ${reason}`);
      console.log("fail", d.row_index, d.company || d.name, reason);
    }
  }

  console.log(JSON.stringify({ eligible: rows.length, sent, skipped, failed, failures }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
