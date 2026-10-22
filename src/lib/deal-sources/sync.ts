import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "../supabase-admin-core";
import type { Deal } from "../types";
import { sheetSource } from "./sheet-source";
import { evaluateDeal } from "../rating/evaluate";
import { RUBRIC_VERSION } from "../rating/rubric";
import { isAttioConfigured } from "../attio/client";
import {
  ATTIO_STAGE_NEW,
  syncAttioAfterRating,
  upsertDealToInbound,
} from "../attio/inbound-sync";

const RATE_BATCH = Number(process.env.RATING_BATCH_LIMIT || 150);

function needsRating(
  rowIndex: number,
  ratedMeta: Map<number, string | null>,
): boolean {
  if (!ratedMeta.has(rowIndex)) return true; // brand new to supabase
  const via = ratedMeta.get(rowIndex);
  // Unrated, or rated under an older rubric version.
  if (via == null) return true;
  if (via.startsWith("empty-company")) return false;
  return !via.includes(RUBRIC_VERSION);
}

export function dealToRow(d: Deal) {
  return {
    row_index: d.rowIndex,
    date_received: d.dateReceived,
    date_received_ms: d.dateReceivedMs,
    name: d.name,
    company: d.company,
    sector: d.sector,
    website: d.website,
    deck_link: d.deckLink,
    blurb: d.blurb,
    summary: d.summary,
    sender_email: d.senderEmail,
    thread_id: d.threadId,
    action: d.action,
    action_date: d.actionDate,
    status: d.status,
    linkedin: d.linkedin,
    elite_school: d.eliteSchool,
    rating: d.rating,
    worth: d.worth,
    owner: d.owner,
    channel: d.channel,
    synced_at: new Date().toISOString(),
  };
}

export type SyncResult = {
  count: number;
  durationMs: number;
  newDeals: number;
  rated: number;
  crmPushed: number;
  crmFailed: number;
};

/** Stars at or below this are auto-moved to Pass (unless already on a call bucket). */
export const AUTO_PASS_MAX_STARS = 1;

export type PersistRatingResult = {
  autoPassed: boolean;
  /** Portal stage fields when auto-passed (for live UI patches). */
  stage?: {
    manualBucket: "pass";
    manualBucketAt: string;
    manualBucketBy: string;
    status: string;
    action: string;
    actionDate: string;
  };
};

/**
 * Persist AI rating fields for one deal.
 * 0★ / 1★ → auto Pass (status/action + manual_bucket), unless a human already
 * put the deal on a call_* bucket.
 */
/** 4★ deals with no stage yet land in In Review. Passes and calls are left alone. */
async function placeFourStarInReview(rowIndex: number): Promise<void> {
  if (!isSupabaseAdminConfigured) return;
  const admin = getSupabaseAdminCore();
  const { data: existing } = await admin
    .from("deals")
    .select("manual_bucket, status, action")
    .eq("row_index", rowIndex)
    .maybeSingle();

  const bucket = String(existing?.manual_bucket || "").trim().toLowerCase();
  if (
    bucket === "pass" ||
    bucket === "pass_temporary" ||
    bucket === "pass_by_aditya" ||
    bucket === "request_info" ||
    bucket.startsWith("call_with_")
  ) {
    return;
  }
  const text = `${existing?.status || ""} ${existing?.action || ""}`.trim();
  if (text) return;

  const { error } = await admin
    .from("deals")
    .update({ status: "In Review", action: "In Review" })
    .eq("row_index", rowIndex);
  if (error) {
    console.warn(`[in-review] failed for row ${rowIndex}:`, error.message);
  }
}

export async function persistDealRating(
  rowIndex: number,
  rating: {
    stars: number;
    worth: string;
    summary: string;
    via: string;
    mode: string;
  },
): Promise<PersistRatingResult> {
  if (!isSupabaseAdminConfigured) {
    throw new Error("Supabase admin is not configured.");
  }
  const admin = getSupabaseAdminCore();
  const ratedAt = new Date().toISOString();
  const { error } = await admin
    .from("deals")
    .update({
      ai_rating_stars: rating.stars,
      ai_worth: rating.worth,
      ai_summary: rating.summary,
      ai_via: rating.via,
      ai_mode: rating.mode,
      ai_rated_at: ratedAt,
    })
    .eq("row_index", rowIndex);

  if (error) {
    throw new Error(
      `Failed to save rating (did you run supabase/migrate-rating-bucket.sql?): ${error.message}`,
    );
  }

  if (rating.stars >= 4) {
    await placeFourStarInReview(rowIndex);
    return { autoPassed: false };
  }

  if (rating.stars > AUTO_PASS_MAX_STARS) {
    return { autoPassed: false };
  }

  return autoPassLowStarDeal(rowIndex, ratedAt);
}

/**
 * Mark a low-star deal as Pass in the portal.
 * Skips if already passed or on a call_* bucket (human override wins).
 * Reject email is NOT sent here — daily cron sends after 24h from date received.
 */
export async function autoPassLowStarDeal(
  rowIndex: number,
  at = new Date().toISOString(),
): Promise<PersistRatingResult> {
  if (!isSupabaseAdminConfigured) {
    return { autoPassed: false };
  }
  const admin = getSupabaseAdminCore();

  const { data: existing } = await admin
    .from("deals")
    .select("manual_bucket")
    .eq("row_index", rowIndex)
    .maybeSingle();

  const bucket = String(existing?.manual_bucket || "")
    .trim()
    .toLowerCase();
  if (
    bucket === "pass" ||
    bucket === "pass_temporary" ||
    bucket === "pass_by_aditya" ||
    bucket === "request_info" ||
    bucket.startsWith("call_with_")
  ) {
    return { autoPassed: false };
  }

  const today = at.slice(0, 10);
  const stage = {
    manualBucket: "pass" as const,
    manualBucketAt: at,
    manualBucketBy: "system:auto-pass",
    status: "Pass",
    action: "Pass",
    actionDate: today,
  };

  const { error } = await admin
    .from("deals")
    .update({
      manual_bucket: stage.manualBucket,
      manual_bucket_at: stage.manualBucketAt,
      manual_bucket_by: stage.manualBucketBy,
      status: stage.status,
      action: stage.action,
      action_date: stage.actionDate,
    })
    .eq("row_index", rowIndex);

  if (error) {
    console.warn(
      `[auto-pass] failed for row ${rowIndex}:`,
      error.message,
    );
    return { autoPassed: false };
  }

  return { autoPassed: true, stage };
}

/**
 * Pull the current Sheet snapshot and upsert it into Supabase.
 * Rates unrated deals (not only brand-new rows) up to RATE_BATCH per run.
 * Auto-pushes brand-new deals to Attio Inbound (Kanban column by Worth?).
 */
export async function syncSheetToSupabase(): Promise<SyncResult> {
  if (!isSupabaseAdminConfigured) {
    throw new Error(
      "Supabase admin is not configured — set SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const started = Date.now();
  const admin = getSupabaseAdminCore();

  const { data: run } = await admin
    .from("sync_runs")
    .insert({ source: "sheet", row_count: 0 })
    .select("id")
    .single();

  try {
    const payload = await sheetSource.fetch();

    const { data: existingRows } = await admin
      .from("deals")
      .select("row_index, ai_rated_at, ai_via");

    const existingSet = new Set(
      (existingRows ?? []).map((r) => r.row_index as number),
    );
    const ratedMeta = new Map<number, string | null>();
    for (const r of existingRows ?? []) {
      const idx = r.row_index as number;
      if (r.ai_rated_at) {
        ratedMeta.set(idx, (r.ai_via as string | null) ?? "");
      } else {
        ratedMeta.set(idx, null);
      }
    }

    const newDeals = payload.deals.filter((d) => !existingSet.has(d.rowIndex));

    // Rate brand-new deals first, then unrated / old-rubric backlog (capped).
    const toRate: Deal[] = [];
    for (const d of newDeals) {
      if (toRate.length >= RATE_BATCH) break;
      toRate.push(d);
    }
    if (toRate.length < RATE_BATCH) {
      for (const d of payload.deals) {
        if (toRate.length >= RATE_BATCH) break;
        if (!needsRating(d.rowIndex, ratedMeta)) continue;
        if (toRate.some((x) => x.rowIndex === d.rowIndex)) continue;
        toRate.push(d);
      }
    }

    let rated = 0;
    const worthByRow = new Map<number, string>();
    const starsByRow = new Map<number, number>();

    // Upsert sheet fields first (without ai_* so missing migration doesn't block sync).
    const rows = payload.deals.map(dealToRow);
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await admin
        .from("deals")
        .upsert(chunk, { onConflict: "row_index" });
      if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    // Brand-new deals → Attio "New" immediately on receive.
    let crmPushed = 0;
    let crmFailed = 0;
    if (newDeals.length > 0 && isAttioConfigured()) {
      for (const deal of newDeals) {
        try {
          const r = await upsertDealToInbound(deal, { stage: ATTIO_STAGE_NEW });
          await admin
            .from("deals")
            .update({
              crm_entry_id: r.entryId,
              crm_synced_at: new Date().toISOString(),
            })
            .eq("row_index", deal.rowIndex);
          crmPushed += 1;
        } catch (err) {
          crmFailed += 1;
          console.warn(`[sync] Attio New push failed for row ${deal.rowIndex}:`, err);
        }
      }
    }

    for (const deal of toRate) {
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
        console.warn(`[sync] rating failed for row ${deal.rowIndex}:`, err);
      }
    }

    // Post-rating moves: 0–1★ → Passes only (Human Review = call bucket action).
    if (isAttioConfigured()) {
      for (const base of toRate) {
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
          console.warn(`[sync] Attio stage sync failed for row ${deal.rowIndex}:`, err);
        }
      }
    }

    if (run?.id) {
      await admin
        .from("sync_runs")
        .update({
          row_count: rows.length,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    return {
      count: rows.length,
      durationMs: Date.now() - started,
      newDeals: newDeals.length,
      rated,
      crmPushed,
      crmFailed,
    };
  } catch (err) {
    if (run?.id) {
      await admin
        .from("sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", run.id);
    }
    throw err;
  }
}
