/**
 * Continue normal (team / Kushal) pass notes after the last sent row (Emerge, 3954).
 * Aditya-tagged and pass-by-Aditya rows are skipped.
 * One email per address. Stops after SEND_LIMIT successful sends.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const AFTER_ROW = 3954;
const BEFORE_ROW = 4078;
const SEND_LIMIT = 50;

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
  const { sendPassRejectIfNeeded } = await import("../src/lib/pass-reject-email");
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
    .gt("row_index", AFTER_ROW)
    .lt("row_index", BEFORE_ROW)
    .eq("manual_bucket", "pass")
    .order("row_index");
  if (error) throw new Error(error.message);

  const rows = (data || []).filter((d) => {
    if (d.ai_rating_stars === 4 || d.ai_rating_stars === 1) return false;
    if (isMeeting(d)) return false;
    if (String(d.manual_bucket_by || "").includes("reject-sent")) return false;
    if (String(d.owner || "").trim().toLowerCase() === "aditya") return false;
    if (d.manual_bucket === "pass_by_aditya") return false;
    return true;
  });

  const seen = new Set<string>();
  let sent = 0;
  let sentTeam = 0;
  let sentAditya = 0;
  let skipped = 0;
  let failed = 0;
  const failures: string[] = [];

  const stamp = async (rowIndex: number, by: string | null, bucket?: string) => {
    const base = String(by || "system:auto-pass").replace(/\|reject-sent/g, "");
    const patch: Record<string, string> = {
      manual_bucket_by: `${base}|reject-sent`,
    };
    if (bucket) patch.manual_bucket = bucket;
    await admin.from("deals").update(patch).eq("row_index", rowIndex);
  };

  for (const d of rows) {
    if (sent >= SEND_LIMIT) break;
    const email = String(d.sender_email || "").trim().toLowerCase();
    const fromAditya = false;

    if (email && seen.has(email)) {
      await stamp(d.row_index, d.manual_bucket_by, fromAditya ? "pass_by_aditya" : undefined);
      skipped += 1;
      console.log("dup", d.row_index, d.company);
      continue;
    }
    if (email) seen.add(email);

    if (fromAditya) {
      if (!email.includes("@")) {
        skipped += 1;
        console.log("skip", d.row_index, d.company || d.name, "no_email");
        continue;
      }
      if (shouldBlockOutboundFounderEmail(email)) {
        await stamp(d.row_index, d.manual_bucket_by, "pass_by_aditya");
        skipped += 1;
        console.log("skip", d.row_index, d.company || d.name, "blocked");
        continue;
      }
      try {
        await sendPassRejectEmailFromAditya({
          founderEmail: email,
          founderName: String(d.name || ""),
        });
        await stamp(d.row_index, d.manual_bucket_by, "pass_by_aditya");
        sent += 1;
        sentAditya += 1;
        console.log("sent-aditya", d.row_index, d.company || d.name);
      } catch (err) {
        failed += 1;
        const reason = err instanceof Error ? err.message : "send_failed";
        failures.push(`${d.row_index} ${d.company}: ${reason}`);
        console.log("fail", d.row_index, d.company || d.name, reason);
      }
    } else {
      const result = await sendPassRejectIfNeeded({
        rowIndex: d.row_index,
        founderEmail: d.sender_email,
        founderName: d.name,
      });
      if (result.sent) {
        sent += 1;
        sentTeam += 1;
        console.log("sent-team", d.row_index, d.company || d.name);
      } else if (
        result.reason === "already_sent" ||
        result.reason === "no_email" ||
        result.reason === "blocked"
      ) {
        skipped += 1;
        console.log("skip", d.row_index, d.company || d.name, result.reason);
        continue;
      } else {
        failed += 1;
        failures.push(`${d.row_index} ${d.company}: ${result.reason}`);
        console.log("fail", d.row_index, d.company || d.name, result.reason);
        continue;
      }
    }

    if (sent >= SEND_LIMIT) break;
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log(
    JSON.stringify({
      eligible: rows.length,
      sent,
      sentTeam,
      sentAditya,
      skipped,
      failed,
      failures,
    }),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
