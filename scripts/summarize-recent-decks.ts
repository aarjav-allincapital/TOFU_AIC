/**
 * Summarize decks for the latest 5★ deals that have a deck_link.
 *
 *   ENABLE_DECK_SUMMARY=1 npx tsx scripts/summarize-recent-decks.ts
 *   LIMIT=10 ENABLE_DECK_SUMMARY=1 npx tsx scripts/summarize-recent-decks.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({ path: ".env.local" });

process.env.ENABLE_DECK_SUMMARY = process.env.ENABLE_DECK_SUMMARY || "1";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module") as typeof import("module") & {
  prototype: { require: (...args: unknown[]) => unknown };
};
const originalRequire = Module.prototype.require;
Module.prototype.require = function (this: unknown, id: string, ...rest: unknown[]) {
  if (id === "server-only") return {};
  return originalRequire.apply(this, [id, ...rest] as never);
};

import type { Deal } from "../src/lib/types";

async function main() {
  const limit = Number(process.env.LIMIT || 10);
  const { getSupabaseAdminCore, isSupabaseAdminConfigured } = await import(
    "../src/lib/supabase-admin-core"
  );
  if (!isSupabaseAdminConfigured) throw new Error("Supabase admin not configured");

  const { summarizeDealDeck } = await import("../src/lib/deck");
  const admin = getSupabaseAdminCore();

  // Clear prior deck summaries outside 1★/5★ (policy: only those get a deck summary).
  await admin
    .from("deals")
    .update({
      deck_summary: null,
      deck_text_excerpt: null,
      deck_summarized_at: null,
      deck_summary_via: null,
    })
    .not("deck_summarized_at", "is", null)
    .not("ai_rating_stars", "in", "(1,5)");

  const { data, error } = await admin
    .from("deals")
    .select(
      "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rating_stars",
    )
    .in("ai_rating_stars", [1, 5])
    .neq("deck_link", "")
    .not("deck_link", "is", null)
    .order("row_index", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = data || [];
  console.log(`Summarizing ${rows.length} one-/five-star decks…`);

  let ok = 0;
  let other = 0;
  for (const r of rows) {
    const deal: Deal = {
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
      aiWorth: null,
      aiSummary: null,
      aiVia: null,
      aiMode: null,
      aiRatedAt: null,
      manualBucket: null,
      manualBucketAt: null,
      manualBucketBy: null,
      crmEntryId: null,
      crmSyncedAt: null,
      deckSummary: null,
      deckTextExcerpt: null,
      deckSummarizedAt: null,
      deckSummaryVia: null,
      linkedinWorkHistory: null,
      linkedinCollege: null,
      linkedinEnrichedAt: null,
      linkedinEnrichVia: null,
    };

    process.stdout.write(
      `row ${deal.rowIndex} ${deal.company || "(unnamed)"} … `,
    );
    try {
      const result = await summarizeDealDeck(deal);
      if (result.via === "ok") {
        ok += 1;
        console.log(
          `ok (${(result.summary || "").slice(0, 100).replace(/\n/g, " | ")}…)`,
        );
      } else {
        other += 1;
        console.log(result.via);
      }
    } catch (err) {
      other += 1;
      console.log("FAIL", err instanceof Error ? err.message : err);
    }
  }

  console.log(`✓ done ok=${ok} other=${other}`);
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
