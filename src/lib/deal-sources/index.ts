import { isSupabaseConfigured } from "../supabase";
import type { DealsPayload } from "../types";
import { sheetSource } from "./sheet-source";
import { fetchAiOverlay, supabaseSource } from "./supabase-source";
import { readJevStore } from "../rating/jev-store";
import { EMPTY_JEV_FIELDS } from "../rating/jev-fields";
import { isLocalLab } from "../local-lab";
import { withoutHiddenDeals } from "./hidden";

/**
 * The Google Sheet is the SYSTEM OF RECORD and always the read source — it has
 * every deal, including ones added since the last Supabase sync. Supabase only
 * supplies overlay fields (rating / bucket / CRM) and is a fallback if the
 * Sheet is unreachable. Never serve the Supabase mirror as the primary list, or
 * newly-arrived companies disappear until the next sync.
 */
const SHEET = sheetSource;
const MIRROR = isSupabaseConfigured ? supabaseSource : null;

/** Overlay rating / bucket / CRM fields when the Sheet is the read source. */
async function withAiOverlay(payload: DealsPayload): Promise<DealsPayload> {
  if (!isSupabaseConfigured) return payload;
  try {
    const overlay = await fetchAiOverlay();
    if (overlay.size === 0) return payload;
    return {
      ...payload,
      deals: payload.deals.map((d) => {
        const o = overlay.get(d.rowIndex);
        if (!o) return d;
        const bucket = (o.manual_bucket || "").trim().toLowerCase();
        const infoReplied = Boolean(o.info_replied_at);
        const jevVia = (o.ai_via || "").toLowerCase().includes("jev");
        const stageOverride =
          bucket === "pass_temporary"
            ? {
                status: "Pass",
                action: String(o.manual_bucket_by || "").includes("|have-met")
                  ? "Have met"
                  : "Pass (temporary)",
              }
            : bucket === "pass" || bucket === "pass_by_aditya"
            ? { status: "Pass", action: "Pass" }
            : bucket === "request_info"
              ? {
                  status: infoReplied ? "Replied" : "Requested",
                  action: infoReplied ? "Reply received" : "Request Info",
                }
              : bucket.startsWith("call_with_")
              ? {
                  status: "Meeting",
                  action:
                    d.action && !/^new$/i.test(d.action.trim())
                      ? d.action
                      : "Meeting",
                }
              : {};
        return {
          ...d,
          ...stageOverride,
          aiRatingStars: o.ai_rating_stars,
          aiWorth: o.ai_worth,
          aiSummary: o.ai_summary,
          aiVia: o.ai_via,
          aiMode: o.ai_mode,
          aiRatedAt: o.ai_rated_at,
          manualBucket: o.manual_bucket,
          manualBucketAt: o.manual_bucket_at,
          manualBucketBy: o.manual_bucket_by,
          crmEntryId: o.crm_entry_id,
          crmSyncedAt: o.crm_synced_at,
          deckSummary: o.deck_summary,
          deckTextExcerpt: o.deck_text_excerpt,
          deckSummarizedAt: o.deck_summarized_at,
          deckSummaryVia: o.deck_summary_via,
          linkedinWorkHistory: o.linkedin_work_history,
          linkedinCollege: o.linkedin_college,
          linkedinEnrichedAt: o.linkedin_enriched_at,
          linkedinEnrichVia: o.linkedin_enrich_via,
          infoRepliedAt: o.info_replied_at,
          infoReplyNote: o.info_reply_note,
          ...(isLocalLab()
            ? {
                jevRatingStars:
                  o.jev_rating_stars ?? (jevVia ? o.ai_rating_stars : null),
                jevWorth: o.jev_worth ?? (jevVia ? o.ai_worth : null),
                jevSummary: o.jev_summary ?? (jevVia ? o.ai_summary : null),
                jevVia: o.jev_via ?? (jevVia ? o.ai_via : null),
                jevRatedAt: o.jev_rated_at ?? (jevVia ? o.ai_rated_at : null),
              }
            : EMPTY_JEV_FIELDS),
        };
      }),
    };
  } catch (err) {
    console.warn("[deal-sources] AI overlay fetch failed:", err);
    return payload;
  }
}

async function withJevFileOverlay(payload: DealsPayload): Promise<DealsPayload> {
  try {
    const store = await readJevStore();
    if (store.size === 0) return payload;
    return {
      ...payload,
      deals: payload.deals.map((d) => {
        const j = store.get(d.rowIndex);
        if (!j) return d;
        return {
          ...d,
          jevRatingStars: j.stars,
          jevWorth: j.worth,
          jevSummary: j.summary,
          jevVia: j.via,
          jevRatedAt: j.ratedAt,
        };
      }),
    };
  } catch {
    return payload;
  }
}

function withoutHidden(payload: DealsPayload): DealsPayload {
  const deals = withoutHiddenDeals(payload.deals);
  return { ...payload, deals, count: deals.length };
}

export async function fetchDealsPayload(): Promise<DealsPayload> {
  // Sheet is the source of record — always the full, current list.
  try {
    const payload = await SHEET.fetch();
    const withAi = await withAiOverlay(payload);
    const withJev = isLocalLab() ? await withJevFileOverlay(withAi) : withAi;
    return withoutHidden(withJev);
  } catch (err) {
    if (!MIRROR) throw err;
    console.warn(`[deal-sources] ${SHEET.name} failed, falling back to mirror:`, err);
    const mirrored = await MIRROR.fetch();
    const visible = isLocalLab()
      ? mirrored
      : {
          ...mirrored,
          deals: mirrored.deals.map((d) => ({ ...d, ...EMPTY_JEV_FIELDS })),
        };
    return withoutHidden(visible);
  }
}

export { syncSheetToSupabase, persistDealRating } from "./sync";
