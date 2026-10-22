/**
 * One-time: send Pass reject emails for deals from REVE onward (inclusive).
 * Deduped via manual_bucket_by "|reject-sent" marker. No Attio writes.
 *
 *   npx tsx scripts/send-pass-rejects-from-reve.ts
 *   DRY_RUN=1 npx tsx scripts/send-pass-rejects-from-reve.ts
 *   LIMIT=5 npx tsx scripts/send-pass-rejects-from-reve.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendPassRejectEmail(founderEmail: string, founderName: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY missing");
  const from =
    process.env.RESEND_FROM_CALL ||
    process.env.RESEND_FROM_TEAM ||
    "All In Capital <team@allincapital.vc>";
  const replyTo =
    process.env.KUSHAL_REPLY_TO ||
    process.env.RESEND_REPLY_TO ||
    "response@allincapital.vc";
  const name = founderName.trim() || "there";

  const text = `Hey ${name},

Thanks for reaching out to us.  We wanted to let you know that at this point, we're not able to move forward with your startup for an investment.

Given the volume of inbounds we get , it's not possible for us to give personalised feedback on why we are passing. However in most cases the reasons come down to relevance to our current themes of interest or overall clarity in the pitch or the execution that the founder has demonstrated.

If you'd like to be reconsidered, the best path is through a referral from someone in our portfolio or founder network.

You are welcome to reach out again at https://superdm.com/kushal in a few weeks or months if you feel you have changed direction or have much more traction.

Thanks again for applying, and we wish you all the best on your journey.`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p>Hey ${escapeHtml(name)},</p>
<p>Thanks for reaching out to us.&nbsp;&nbsp;We wanted to let you know that at this point, we're not able to move forward with your startup for an investment.</p>
<p>Given the volume of inbounds we get , it's not possible for us to give personalised feedback on why we are passing. However in most cases the reasons come down to relevance to our current themes of interest or overall clarity in the pitch or the execution that the founder has demonstrated.</p>
<p>If you'd like to be reconsidered, the best path is through a referral from someone in our portfolio or founder network.</p>
<p>You are welcome to reach out again at <a href="https://superdm.com/kushal" style="color:#111827;font-weight:600;">https://superdm.com/kushal</a> in a few weeks or months if you feel you have changed direction or have much more traction.</p>
<p>Thanks again for applying, and we wish you all the best on your journey.</p>
</div>`;

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const dry = process.env.DRY_RUN === "1";
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

  const { data: reve, error: reveErr } = await admin
    .from("deals")
    .select("row_index, company, date_received_ms")
    .eq("company", "REVE")
    .maybeSingle();
  if (reveErr) throw new Error(reveErr.message);
  if (!reve?.date_received_ms) {
    throw new Error('Could not find company "REVE" to anchor the cohort.');
  }

  console.log(
    `Anchor: REVE row ${reve.row_index} @ ${reve.date_received_ms}` +
      (dry ? " (DRY RUN)" : ""),
  );

  const { data: rows, error } = await admin
    .from("deals")
    .select(
      "row_index, company, name, sender_email, date_received, manual_bucket_by",
    )
    .eq("manual_bucket", "pass")
    .gte("date_received_ms", reve.date_received_ms)
    .order("date_received_ms", { ascending: true })
    .limit(limit || 500);
  if (error) throw new Error(error.message);

  const targets = (rows || []).filter((r) => {
    if (String(r.manual_bucket_by || "").includes("|reject-sent")) return false;
    return String(r.sender_email || "").includes("@");
  });

  console.log(
    `Pass cohort from REVE: ${(rows || []).length} · to email: ${targets.length}`,
  );

  let sent = 0;
  let failed = 0;
  for (const r of targets) {
    const name = String(r.name || "").trim();
    const email = String(r.sender_email || "").trim();
    console.log(
      `  ${dry ? "would send" : "sending"} → ${name || "?"} <${email}> (${r.company})`,
    );
    if (dry) {
      sent += 1;
      continue;
    }
    try {
      await sendPassRejectEmail(email, name);
      const stampedBy = `${String(r.manual_bucket_by || "system:pass").replace("|reject-sent", "")}|reject-sent`;
      await admin
        .from("deals")
        .update({ manual_bucket_by: stampedBy })
        .eq("row_index", r.row_index);
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

  console.log(`✓ done sent=${sent} failed=${failed}`);
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
