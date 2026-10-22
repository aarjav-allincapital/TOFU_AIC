import "server-only";
import type { Deal } from "@/lib/types";
import { EMPTY_JEV_FIELDS } from "@/lib/rating/jev-fields";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin-core";
import { enrichDealLinkedIn, isLinkedInEnrichEnabled } from "./index";

export type LinkedInBackfillResult = {
  attempted: number;
  ok: number;
  failed: number;
};

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
 * Cron / manual: enrich deals that have a LinkedIn /in/ URL and still need
 * a structured preview (never enriched, or legacy plain-text).
 */
export async function enrichLinkedInBacklog(
  limit = 40,
  opts: { force?: boolean } = {},
): Promise<LinkedInBackfillResult> {
  if (!isLinkedInEnrichEnabled()) {
    return { attempted: 0, ok: 0, failed: 0 };
  }
  if (!isSupabaseAdminConfigured) {
    return { attempted: 0, ok: 0, failed: 0 };
  }

  const admin = getSupabaseAdminCore();
  const pageSize = Math.max(1, Math.min(limit * 4, 200));

  // Pull a recent window, then pick ones that still need structured preview.
  // (PostgREST can't easily express "not JSON" in one filter.)
  const { data, error } = await admin
    .from("deals")
    .select(
      "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rating_stars, linkedin_work_history, linkedin_college, linkedin_enriched_at, linkedin_enrich_via",
    )
    .neq("linkedin", "")
    .not("linkedin", "is", null)
    .order("row_index", { ascending: false })
    .limit(pageSize);

  if (error) {
    if (/linkedin_enriched_at|linkedin_work_history/i.test(error.message)) {
      console.warn(
        "[linkedin] backlog skipped — run supabase/migrate-linkedin-enrich.sql",
      );
      return { attempted: 0, ok: 0, failed: 0 };
    }
    console.warn("[linkedin] backlog query failed:", error.message);
    return { attempted: 0, ok: 0, failed: 0 };
  }

  const rows = (data || [])
    .filter((r) => /linkedin\.com\/in\//i.test(String(r.linkedin || "")))
    .filter((r) => {
      if (opts.force) return true;
      if (!r.linkedin_enriched_at) return true;
      const stored = String(r.linkedin_work_history || "").trim();
      return (
        r.linkedin_enrich_via === "ok" && stored.length > 0 && !stored.startsWith("{")
      );
    })
    .slice(0, Math.max(1, limit));

  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const result = await enrichDealLinkedIn(rowToDeal(r), {
        // Only force when caller asked — otherwise respect enriched_at skip.
        force: Boolean(opts.force),
      });
      if (result.via === "ok") ok += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { attempted: rows.length, ok, failed };
}
