import "server-only";
import type { Deal, DealsPayload } from "../types";
import { EMPTY_JEV_FIELDS } from "../rating/jev-fields";
import {
  isSupabaseAdminConfigured,
  getSupabaseAdminCore,
} from "../supabase-admin-core";
import { evaluateDeal } from "../rating/evaluate";
import { RUBRIC_VERSION } from "../rating/rubric";
import { persistDealRating, dealToRow, autoPassLowStarDeal } from "./sync";
import { isAttioConfigured } from "../attio/client";
import {
  ATTIO_STAGE_NEW,
  syncAttioAfterRating,
  upsertDealToInbound,
} from "../attio/inbound-sync";

/** Cap new deals inserted/pushed per poll so one big paste can't stampede. */
const NEW_PER_POLL = Number(process.env.NEW_DEALS_PER_POLL || 15);

/** Small batch for after()-on-read (keep serverless work short). */
const LIVE_BATCH = Number(process.env.RATING_LIVE_BATCH || 25);
/** Larger batch for cron / dedicated rate endpoint. */
const CRON_BATCH = Number(process.env.RATING_BATCH_LIMIT || 400);
const CONCURRENCY = Number(process.env.RATING_CONCURRENCY || 8);

function needsLiveRating(d: Deal): boolean {
  if (!(d.company?.trim() || d.name?.trim())) return false;
  if (d.aiRatedAt == null) return true;
  if (String(d.aiVia || "").startsWith("empty-company")) return false;
  return !String(d.aiVia || "").includes(RUBRIC_VERSION);
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
) {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

/**
 * Rate a handful of deals from an already-fetched payload.
 * Used in `after()` so it never blocks the /api/deals response.
 */
export async function autoRateUnrated(payload: DealsPayload): Promise<DealsPayload> {
  if (!isSupabaseAdminConfigured) return payload;

  const candidates = payload.deals.filter(needsLiveRating);
  if (candidates.length === 0) return payload;

  const toRate = candidates.slice(0, LIVE_BATCH);
  const patches = new Map<number, Partial<Deal>>();
  const deckCandidates: Deal[] = [];

  await mapPool(toRate, CONCURRENCY, async (deal) => {
    try {
      const result = await evaluateDeal(deal);
      const persisted = await persistDealRating(deal.rowIndex, {
        stars: result.stars,
        worth: result.worth,
        summary: result.summary,
        via: result.via,
        mode: result.mode,
      });
      const ratedDeal: Deal = {
        ...deal,
        aiRatingStars: result.stars,
        aiWorth: result.worth,
        aiSummary: result.summary,
        aiVia: result.via,
        aiMode: result.mode,
        aiRatedAt: new Date().toISOString(),
        ...(persisted.stage
          ? {
              manualBucket: persisted.stage.manualBucket,
              manualBucketAt: persisted.stage.manualBucketAt,
              manualBucketBy: persisted.stage.manualBucketBy,
              status: persisted.stage.status,
              action: persisted.stage.action,
              actionDate: persisted.stage.actionDate,
            }
          : {}),
      };
      patches.set(deal.rowIndex, ratedDeal);

      // Live path only updates the separate Inbound list.
      // Deal Flow is manual-only via the explicit "Add to Attio" action.
      if (isAttioConfigured()) {
        try {
          await syncAttioAfterRating(ratedDeal);
        } catch (err) {
          console.warn(`[auto-rate] Attio stage sync failed for row ${deal.rowIndex}:`, err);
        }
      }

      if (
        (result.stars === 5 || result.stars === 1) &&
        (deal.deckLink || "").trim()
      ) {
        deckCandidates.push(ratedDeal);
      }
      // LinkedIn: only scrape brand-new Sheet rows in reconcileNewDeals —
      // not the unrated backlog (that burned Bright Data credits).
    } catch (err) {
      console.warn(`[auto-rate] failed for row ${deal.rowIndex}:`, err);
    }
  });

  // Real-time deck summaries after rating (1★/5★ + deck only).
  if (deckCandidates.length > 0) {
    try {
      const { runDeckSummariesForDeals } = await import("@/lib/deck");
      await runDeckSummariesForDeals(deckCandidates, {
        concurrency: 2,
        logPrefix: "[auto-rate/deck]",
      });
    } catch (err) {
      console.warn("[auto-rate] deck summaries failed:", err);
    }
  }

  if (patches.size === 0) return payload;

  return {
    ...payload,
    deals: payload.deals.map((d) => {
      const patch = patches.get(d.rowIndex);
      return patch ? { ...d, ...patch } : d;
    }),
  };
}

/**
 * Near-real-time flow for deals that just landed on the Sheet but aren't in
 * Supabase yet: insert them, rate them with the rubric, and auto-push them to
 * Attio's Inbound Kanban (column by Worth?, default "New"). Runs in `after()`
 * on /api/deals so the portal poll drives it without a cron.
 *
 * The pre-existing backlog (already in Supabase) is untouched here — its Attio
 * push stays manual (bulk banner / per-deal button).
 */
export async function reconcileNewDeals(
  payload: DealsPayload,
): Promise<{ inserted: number; rated: number; pushed: number }> {
  if (!isSupabaseAdminConfigured) return { inserted: 0, rated: 0, pushed: 0 };
  const admin = getSupabaseAdminCore();

  // Which rows already exist in Supabase?
  const existing = new Set<number>();
  {
    const PAGE = 1000;
    let from = 0;
    for (;;) {
      const { data, error } = await admin
        .from("deals")
        .select("row_index")
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      for (const r of data) existing.add(r.row_index as number);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }

  const brandNew = payload.deals
    .filter((d) => !existing.has(d.rowIndex) && (d.company?.trim() || d.name?.trim()))
    .slice(0, NEW_PER_POLL);

  if (brandNew.length === 0) return { inserted: 0, rated: 0, pushed: 0 };

  // 1) Insert the raw rows so ratings/CRM ids can be persisted against them.
  const { error: insErr } = await admin
    .from("deals")
    .upsert(brandNew.map(dealToRow), { onConflict: "row_index" });
  if (insErr) {
    console.warn("[reconcile] insert failed:", insErr.message);
    return { inserted: 0, rated: 0, pushed: 0 };
  }

  // 2) Push to Attio "New" immediately on receive (before / regardless of rating).
  let pushed = 0;
  if (isAttioConfigured()) {
    for (const deal of brandNew) {
      try {
        const r = await upsertDealToInbound(deal, { stage: ATTIO_STAGE_NEW });
        await admin
          .from("deals")
          .update({
            crm_entry_id: r.entryId,
            crm_synced_at: new Date().toISOString(),
          })
          .eq("row_index", deal.rowIndex);
        pushed += 1;
      } catch (err) {
        console.warn(`[reconcile] Attio New push failed for row ${deal.rowIndex}:`, err);
      }
    }
  }

  // 3) Rate, then move Attio card for 0–1★ → Passes only.
  //    Human Review is only set when someone picks a call_* bucket.
  const worthByRow = new Map<number, string>();
  const starsByRow = new Map<number, number>();
  let rated = 0;
  await mapPool(brandNew, CONCURRENCY, async (deal) => {
    try {
      const result = await evaluateDeal(deal);
      await persistDealRating(deal.rowIndex, {
        stars: result.stars,
        worth: result.worth,
        summary: result.summary,
        via: result.via,
        mode: result.mode,
      });
      worthByRow.set(deal.rowIndex, result.worth);
      starsByRow.set(deal.rowIndex, result.stars);
      rated += 1;
    } catch (err) {
      console.warn(`[reconcile] rating failed for row ${deal.rowIndex}:`, err);
    }
  });

  if (isAttioConfigured()) {
    for (const base of brandNew) {
      const stars = starsByRow.get(base.rowIndex);
      if (stars == null) continue;
      const deal: Deal = {
        ...base,
        aiWorth: worthByRow.get(base.rowIndex) ?? base.aiWorth,
        aiRatingStars: stars,
      };
        try {
          const moved = await syncAttioAfterRating(deal);
          if (moved) {
            await admin
              .from("deals")
              .update({
                crm_entry_id: moved.entryId,
                crm_synced_at: new Date().toISOString(),
              })
              .eq("row_index", deal.rowIndex);
          }
        } catch (err) {
          console.warn(`[reconcile] Attio stage sync failed for row ${deal.rowIndex}:`, err);
      }
    }
  }

  // 4) Real-time PDF deck summaries — 1★/5★ + deck (founders + raise).
  try {
    const { runDeckSummariesForDeals } = await import("@/lib/deck");
    const eligible = brandNew
      .map((base) => {
        const stars = starsByRow.get(base.rowIndex);
        if ((stars !== 5 && stars !== 1) || !(base.deckLink || "").trim()) {
          return null;
        }
        return { ...base, aiRatingStars: stars } as Deal;
      })
      .filter((d): d is Deal => d != null);
    await runDeckSummariesForDeals(eligible, {
      concurrency: 2,
      logPrefix: "[reconcile/deck]",
    });
  } catch (err) {
    console.warn("[reconcile] deck agent unavailable:", err);
  }

  // 5) LinkedIn preview — only for brand-new Sheet rows (once).
  try {
    const { runLinkedInEnrichForDeals } = await import("@/lib/linkedin");
    const eligible = brandNew
      .map((base) => {
        const stars = starsByRow.get(base.rowIndex);
        return {
          ...base,
          aiRatingStars: stars ?? base.aiRatingStars,
        } as Deal;
      })
      .filter((d) => (d.linkedin || "").trim());
    await runLinkedInEnrichForDeals(eligible, {
      concurrency: 1,
      logPrefix: "[reconcile/linkedin]",
    });
  } catch (err) {
    console.warn("[reconcile] linkedin enrich unavailable:", err);
  }

  return { inserted: brandNew.length, rated, pushed };
}

export type RateBacklogResult = {
  attempted: number;
  rated: number;
  remaining: number;
  autoPassed: number;
};

/**
 * Backfill: mark already-rated 0★/1★ deals as Pass if they aren't on a call bucket.
 */
export async function backfillAutoPassLowStars(
  limit = 500,
): Promise<number> {
  if (!isSupabaseAdminConfigured) return 0;
  const admin = getSupabaseAdminCore();

  const { data, error } = await admin
    .from("deals")
    .select("row_index, ai_rating_stars, manual_bucket")
    .not("ai_rated_at", "is", null)
    .lte("ai_rating_stars", 1)
    .order("date_received_ms", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[auto-pass] backfill query failed:", error.message);
    return 0;
  }

  let passed = 0;
  for (const row of data ?? []) {
    const bucket = String(row.manual_bucket || "")
      .trim()
      .toLowerCase();
    if (
      bucket === "pass" ||
      bucket === "pass_temporary" ||
      bucket === "pass_by_aditya" ||
      bucket === "request_info" ||
      bucket.startsWith("call_with_")
    )
      continue;
    const result = await autoPassLowStarDeal(row.row_index as number);
    if (result.autoPassed) passed += 1;
  }
  return passed;
}

/**
 * Rate unrated / old-rubric rows directly from Supabase (no Sheet fetch).
 * Meant for cron so the 2k+ backlog can catch up without slowing the portal.
 */
export async function rateBacklogFromSupabase(
  limit = CRON_BATCH,
): Promise<RateBacklogResult> {
  if (!isSupabaseAdminConfigured) {
    return { attempted: 0, rated: 0, remaining: 0, autoPassed: 0 };
  }

  const admin = getSupabaseAdminCore();

  // Prefer never-rated rows (ordered newest first), then top up with old-rubric
  // rows if the batch still has room.
  const { data: unratedRows, error: unratedErr } = await admin
    .from("deals")
    .select(
      "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rated_at, ai_via",
    )
    .is("ai_rated_at", null)
    .order("date_received_ms", { ascending: false })
    .limit(limit);

  if (unratedErr) throw new Error(unratedErr.message);

  let rows = unratedRows ?? [];

  if (rows.length < limit) {
    const need = limit - rows.length;
    const { data: oldRows, error: oldErr } = await admin
      .from("deals")
      .select(
        "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rated_at, ai_via",
      )
      .not("ai_rated_at", "is", null)
      .order("date_received_ms", { ascending: false })
      .limit(Math.max(need * 4, 100));
    if (oldErr) throw new Error(oldErr.message);
    const oldCandidates = (oldRows ?? []).filter(
      (r) => !String(r.ai_via || "").includes(RUBRIC_VERSION),
    );
    const seen = new Set(rows.map((r) => r.row_index));
    for (const r of oldCandidates) {
      if (rows.length >= limit) break;
      if (seen.has(r.row_index)) continue;
      rows.push(r);
    }
  }

  const toRate = rows.filter((r) => String(r.company || r.name || "").trim());
  let rated = 0;

  await mapPool(toRate, CONCURRENCY, async (r) => {
    const deal: Deal = {
      id: `row-${r.row_index}`,
      rowIndex: r.row_index as number,
      dateReceived: r.date_received,
      dateReceivedMs: r.date_received_ms,
      name: r.name ?? "",
      company: r.company ?? "",
      sector: r.sector ?? "",
      website: r.website ?? "",
      deckLink: r.deck_link ?? "",
      blurb: r.blurb ?? "",
      summary: r.summary ?? "",
      senderEmail: r.sender_email ?? "",
      threadId: r.thread_id ?? "",
      action: r.action ?? "",
      actionDate: r.action_date,
      status: r.status ?? "",
      linkedin: r.linkedin ?? "",
      eliteSchool: r.elite_school ?? "",
      rating: r.rating ?? "",
      worth: r.worth ?? "",
      owner: "",
      channel: "",
      aiRatingStars: null,
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

    try {
      const result = await evaluateDeal(deal);
      await persistDealRating(deal.rowIndex, {
        stars: result.stars,
        worth: result.worth,
        summary: result.summary,
        via: result.via,
        mode: result.mode,
      });
      rated += 1;

      if (
        process.env.ENABLE_DECK_SUMMARY === "1" &&
        (result.stars === 5 || result.stars === 1) &&
        (deal.deckLink || "").trim()
      ) {
        try {
          const { runDeckSummariesForDeals } = await import("@/lib/deck");
          await runDeckSummariesForDeals(
            [{ ...deal, aiRatingStars: result.stars }],
            { concurrency: 1, logPrefix: "[rate-backlog/deck]" },
          );
        } catch (err) {
          console.warn(
            `[rate-backlog] deck summary failed for row ${deal.rowIndex}:`,
            err,
          );
        }
      }
      // No LinkedIn scrape on rating backlog — new deals only via reconcile.
    } catch (err) {
      console.warn(`[rate-backlog] failed for row ${deal.rowIndex}:`, err);
    }
  });

  const autoPassed = await backfillAutoPassLowStars(500);

  const { count: remaining } = await admin
    .from("deals")
    .select("row_index", { count: "exact", head: true })
    .is("ai_rated_at", null);

  return {
    attempted: toRate.length,
    rated,
    remaining: remaining ?? 0,
    autoPassed,
  };
}
