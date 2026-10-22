import "server-only";
import type { Deal } from "@/lib/types";
import { EMPTY_JEV_FIELDS } from "@/lib/rating/jev-fields";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin-core";
import { isDeckSummaryEnabled, summarizeDealDeck } from "./index";

export type DeckBackfillResult = {
  attempted: number;
  ok: number;
  skipped: number;
  failed: number;
};

function rowToMinimalDeal(r: Record<string, unknown>): Deal {
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
    owner: (r.owner as string) ?? "",
    channel: (r.channel as string) ?? "",
    aiRatingStars: (r.ai_rating_stars as number) ?? null,
    aiWorth: null,
    aiSummary: null,
    aiVia: null,
    aiMode: null,
    aiRatedAt: null,
    ...EMPTY_JEV_FIELDS,
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
}

/**
 * Cron: summarize decks for 5★ or 1★ deals with a link and no deck_summarized_at.
 */
export async function summarizeDeckBacklog(
  limit = 30,
): Promise<DeckBackfillResult> {
  if (!isDeckSummaryEnabled()) {
    return { attempted: 0, ok: 0, skipped: 0, failed: 0 };
  }
  if (!isSupabaseAdminConfigured) {
    return { attempted: 0, ok: 0, skipped: 0, failed: 0 };
  }

  const admin = getSupabaseAdminCore();
  const { data, error } = await admin
    .from("deals")
    .select(
      "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rating_stars",
    )
    .in("ai_rating_stars", [1, 5])
    .neq("deck_link", "")
    .not("deck_link", "is", null)
    .is("deck_summarized_at", null)
    .order("row_index", { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    if (/deck_summarized_at/i.test(error.message)) {
      console.warn(
        "[deck] backlog skipped — run supabase/migrate-deck-summary.sql",
      );
      return { attempted: 0, ok: 0, skipped: 0, failed: 0 };
    }
    console.warn("[deck] backlog query failed:", error.message);
    return { attempted: 0, ok: 0, skipped: 0, failed: 0 };
  }

  const rows = (data || []).filter((r) => String(r.deck_link || "").trim());
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of rows) {
    const deal = rowToMinimalDeal(r);
    try {
      const result = await summarizeDealDeck(deal);
      if (result.via === "ok") ok += 1;
      else if (
        result.via === "disabled" ||
        result.via === "skipped_not_eligible"
      ) {
        skipped += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      failed += 1;
      console.warn(
        `[deck] backlog row ${deal.rowIndex}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { attempted: rows.length, ok, skipped, failed };
}
