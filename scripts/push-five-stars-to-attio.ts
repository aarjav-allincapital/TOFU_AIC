/**
 * Push all 5★ deals → Attio Inbound "Human Review" with Sent to label.
 * No emails are sent.
 *
 * Run: npx tsx scripts/push-five-stars-to-attio.ts
 * Optional: LIMIT=20 npx tsx scripts/push-five-stars-to-attio.ts
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
    aiWorth: (r.ai_worth as string) ?? "Yes",
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

async function main() {
  const { isAttioConfigured, getInboundListSlug } = await import(
    "../src/lib/attio/client"
  );
  if (!isAttioConfigured()) throw new Error("Set ATTIO_API_KEY");

  const { getSupabaseAdminCore, isSupabaseAdminConfigured } = await import(
    "../src/lib/supabase-admin-core"
  );
  if (!isSupabaseAdminConfigured) throw new Error("Supabase admin missing");

  const {
    ATTIO_STAGE_HUMAN_REVIEW,
    syncDealsToAttioInbound,
  } = await import("../src/lib/attio/inbound-sync");

  console.log(
    `Target Attio list: ${getInboundListSlug()} → "${ATTIO_STAGE_HUMAN_REVIEW}" + Sent to`,
  );
  console.log("(No founder emails will be sent.)");

  const admin = getSupabaseAdminCore();
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;

  const { data, error } = await admin
    .from("deals")
    .select(
      "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at",
    )
    .gte("ai_rating_stars", 4)
    .order("date_received_ms", { ascending: false })
    .limit(limit || 5000);
  if (error) throw new Error(error.message);

  const deals = (data || []).map(rowToDeal);
  console.log(`Found ${deals.length} Yes/4★+ deals; pushing to Human Review…`);

  const result = await syncDealsToAttioInbound(deals, {
    stage: ATTIO_STAGE_HUMAN_REVIEW,
    entryExtras: { sent_to: ATTIO_STAGE_HUMAN_REVIEW },
    concurrency: 4,
    concurrencyPauseMs: 30,
  });

  const now = new Date().toISOString();
  for (let i = 0; i < result.pushed.length; i += 50) {
    const chunk = result.pushed.slice(i, i + 50);
    await Promise.all(
      chunk.map((p) =>
        admin
          .from("deals")
          .update({ crm_entry_id: p.entryId, crm_synced_at: now })
          .eq("row_index", p.rowIndex),
      ),
    );
  }

  console.log(
    `✓ Human Review: ${result.succeeded}/${result.attempted} in ${result.durationMs}ms` +
      (result.failed ? ` (${result.failed} failed)` : ""),
  );
  for (const e of result.errors) {
    console.log(`  row ${e.rowIndex} ${e.company}: ${e.error}`);
  }
}

main().catch((err) => {
  console.error("✗ Push failed:", err);
  process.exit(1);
});
