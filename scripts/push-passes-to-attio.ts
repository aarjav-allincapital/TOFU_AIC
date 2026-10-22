/**
 * Push all portal Pass deals → Attio Inbound "Passes" column.
 * No emails are sent.
 *
 * Run: npx tsx scripts/push-passes-to-attio.ts
 * Optional: LIMIT=50 npx tsx scripts/push-passes-to-attio.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

import type { Deal } from "../src/lib/types";

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
    manualBucket: (r.manual_bucket as string) ?? "pass",
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

async function main() {
  const { isAttioConfigured, getInboundListSlug } = await import(
    "../src/lib/attio/client"
  );
  if (!isAttioConfigured()) {
    throw new Error("Set ATTIO_API_KEY in .env.local");
  }

  const { getSupabaseAdminCore, isSupabaseAdminConfigured } = await import(
    "../src/lib/supabase-admin-core"
  );
  if (!isSupabaseAdminConfigured) {
    throw new Error("Supabase admin is not configured.");
  }

  const list = getInboundListSlug();
  console.log(`Target Attio list: ${list} → Kanban column "Passes"`);
  console.log("(No founder emails will be sent.)");

  const admin = getSupabaseAdminCore();
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

  const PAGE = 1000;
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("deals")
      .select(
        "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at",
      )
      .eq("manual_bucket", "pass")
      .order("date_received_ms", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const sliced = limit ? rows.slice(0, limit) : rows;
  console.log(`Found ${rows.length} Pass deals; pushing ${sliced.length}…`);

  const { syncDealsToAttioInbound } = await import(
    "../src/lib/attio/inbound-sync"
  );

  const BATCH = 100;
  let succeeded = 0;
  let failed = 0;
  const sampleErrors: { rowIndex: number; company: string; error: string }[] =
    [];
  const started = Date.now();

  for (let i = 0; i < sliced.length; i += BATCH) {
    const batch = sliced.slice(i, i + BATCH).map(rowToDeal);
    const result = await syncDealsToAttioInbound(batch, {
      stage: "Passes",
      concurrency: 4,
      concurrencyPauseMs: 30,
    });
    succeeded += result.succeeded;
    failed += result.failed;
    for (const e of result.errors) {
      if (sampleErrors.length < 20) sampleErrors.push(e);
    }

    const now = new Date().toISOString();
    await Promise.all(
      result.pushed.map((p) =>
        admin
          .from("deals")
          .update({ crm_entry_id: p.entryId, crm_synced_at: now })
          .eq("row_index", p.rowIndex),
      ),
    );

    const done = Math.min(i + BATCH, sliced.length);
    const elapsed = ((Date.now() - started) / 1000).toFixed(0);
    console.log(
      `  ${done}/${sliced.length}  ok=${succeeded} fail=${failed}  ${elapsed}s`,
    );
  }

  console.log(
    `✓ Attio Passes: ${succeeded}/${sliced.length} ok in ${Date.now() - started}ms` +
      (failed ? ` (${failed} failed)` : ""),
  );
  if (sampleErrors.length) {
    console.log("Sample errors:");
    for (const e of sampleErrors) {
      console.log(`  row ${e.rowIndex} ${e.company}: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error("✗ Push failed:", err);
  process.exit(1);
});
