/**
 * Push remaining portal deals into Attio Inbound sections:
 *   - Pass (no crm_entry_id) → "Passes"
 *   - call_with_* → "Human Review" + Sent to = teammate
 *
 * No founder emails.
 *
 *   npx tsx scripts/push-remaining-to-attio.ts
 *   LIMIT=20 npx tsx scripts/push-remaining-to-attio.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

import type { Deal } from "../src/lib/types";

/** Inline names — avoid importing bucket-config (server-only). */
const CALL_SENT_TO: Record<string, string> = {
  call_with_aarjav: "Aarjav",
  call_with_siddharth: "Siddharth",
  call_with_kushal: "Kushal Bhagia",
  call_with_simran: "Simran Patel",
  call_with_disha: "Disha Choudhary",
  call_with_aditya1: "Aditya Pratap Singh",
  call_with_aditya2: "Aditya Singh",
};

const EXCLUDED_EMAILS = new Set(["shivam@returns.trade"]);
const EXCLUDED_DOMAINS = new Set(["returns.trade"]);

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

function isBlocked(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return false;
  if (EXCLUDED_EMAILS.has(e)) return true;
  return EXCLUDED_DOMAINS.has(emailDomain(e));
}

function rowToDeal(r: Record<string, unknown>): Deal {
  return {
    id: `row-${r.row_index}`,
    rowIndex: r.row_index as number,
    dateReceived: (r.date_received as string) ?? null,
    dateReceivedMs: (r.date_received_ms as number) ?? null,
    name: (r.name as string) ?? "",
    company: (r.company as string) ?? "",
    sector: (r.sector as string) ?? "",
    website: (r.website as string) ?? "",
    deckLink: (r.deck_link as string) ?? "",
    blurb: (r.blurb as string) ?? "",
    summary: (r.summary as string) ?? "",
    senderEmail: (r.sender_email as string) ?? "",
    threadId: (r.thread_id as string) ?? "",
    action: (r.action as string) ?? "",
    actionDate: (r.action_date as string) ?? null,
    status: (r.status as string) ?? "",
    linkedin: (r.linkedin as string) ?? "",
    eliteSchool: (r.elite_school as string) ?? "",
    rating: (r.rating as string) ?? "",
    worth: (r.worth as string) ?? "",
    aiRatingStars: (r.ai_rating_stars as number) ?? null,
    aiWorth: (r.ai_worth as string) ?? "No",
    aiSummary: (r.ai_summary as string) ?? null,
    aiVia: (r.ai_via as string) ?? null,
    aiMode: (r.ai_mode as string) ?? null,
    aiRatedAt: (r.ai_rated_at as string) ?? null,
    manualBucket: (r.manual_bucket as string) ?? null,
    manualBucketAt: (r.manual_bucket_at as string) ?? null,
    manualBucketBy: (r.manual_bucket_by as string) ?? null,
    crmEntryId: (r.crm_entry_id as string) ?? null,
    crmSyncedAt: (r.crm_synced_at as string) ?? null,
    deckSummary: null,
    deckTextExcerpt: null,
    deckSummarizedAt: null,
    deckSummaryVia: null,
    linkedinWorkHistory: null,
    linkedinCollege: null,
    linkedinEnrichedAt: null,
    linkedinEnrichVia: null,
  };
}

const SELECT =
  "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at";

async function main() {
  const { isAttioConfigured, getInboundListSlug } = await import(
    "../src/lib/attio/client"
  );
  if (!isAttioConfigured()) throw new Error("Set ATTIO_API_KEY in .env.local");

  const { getSupabaseAdminCore, isSupabaseAdminConfigured } = await import(
    "../src/lib/supabase-admin-core"
  );
  if (!isSupabaseAdminConfigured) {
    throw new Error("Supabase admin is not configured.");
  }

  const {
    upsertDealToInbound,
    ATTIO_STAGE_PASSES,
    ATTIO_STAGE_HUMAN_REVIEW,
  } = await import("../src/lib/attio/inbound-sync");

  const list = getInboundListSlug();
  const admin = getSupabaseAdminCore();
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

  console.log(`Target Attio list: ${list}`);
  console.log("Pass → Passes · call_* → Human Review (no emails)\n");

  // --- Passes missing crm_entry_id ---
  const PAGE = 1000;
  const passRows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("deals")
      .select(SELECT)
      .eq("manual_bucket", "pass")
      .is("crm_entry_id", null)
      .order("row_index", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    passRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  let passes = passRows
    .map(rowToDeal)
    .filter((d) => d.company.trim() || d.name.trim())
    .filter((d) => !isBlocked(d.senderEmail));
  if (limit) passes = passes.slice(0, limit);

  console.log(`Passes to push: ${passes.length}`);

  let passOk = 0;
  let passFail = 0;
  const passErrors: string[] = [];
  const started = Date.now();

  for (let i = 0; i < passes.length; i++) {
    const deal = passes[i]!;
    try {
      const r = await upsertDealToInbound(deal, { stage: ATTIO_STAGE_PASSES });
      await admin
        .from("deals")
        .update({
          crm_entry_id: r.entryId,
          crm_synced_at: new Date().toISOString(),
        })
        .eq("row_index", deal.rowIndex);
      passOk += 1;
    } catch (err) {
      passFail += 1;
      if (passErrors.length < 15) {
        passErrors.push(
          `row ${deal.rowIndex} ${deal.company}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    if ((i + 1) % 10 === 0 || i + 1 === passes.length) {
      console.log(
        `  Passes ${i + 1}/${passes.length}  ok=${passOk} fail=${passFail}`,
      );
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  // --- Call buckets → Human Review ---
  const { data: callData, error: callErr } = await admin
    .from("deals")
    .select(SELECT)
    .like("manual_bucket", "call_with_%")
    .order("row_index", { ascending: true });
  if (callErr) throw new Error(callErr.message);

  const calls = (callData || [])
    .map(rowToDeal)
    .filter((d) => String(d.manualBucket || "").startsWith("call_with_"))
    .filter((d) => !isBlocked(d.senderEmail));

  console.log(`\nCalls to push/update → Human Review: ${calls.length}`);

  let callOk = 0;
  let callFail = 0;
  const callErrors: string[] = [];

  for (const deal of calls) {
    const bucket = String(deal.manualBucket || "");
    const sentTo = CALL_SENT_TO[bucket] || "Human Review";
    try {
      const r = await upsertDealToInbound(deal, {
        stage: ATTIO_STAGE_HUMAN_REVIEW,
        entryExtras: { sent_to: sentTo },
      });
      await admin
        .from("deals")
        .update({
          crm_entry_id: r.entryId,
          crm_synced_at: new Date().toISOString(),
        })
        .eq("row_index", deal.rowIndex);
      callOk += 1;
      console.log(`  ok ${deal.company} → HR (${sentTo})`);
    } catch (err) {
      callFail += 1;
      const msg = err instanceof Error ? err.message : String(err);
      callErrors.push(`row ${deal.rowIndex} ${deal.company}: ${msg}`);
      console.log(`  FAIL ${deal.company}: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(
    `\n✓ Passes: ${passOk} ok / ${passFail} fail · Calls: ${callOk} ok / ${callFail} fail · ${Date.now() - started}ms`,
  );
  if (passErrors.length) {
    console.log("Pass sample errors:");
    for (const e of passErrors) console.log(`  ${e}`);
  }
  if (callErrors.length) {
    console.log("Call errors:");
    for (const e of callErrors) console.log(`  ${e}`);
  }
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
