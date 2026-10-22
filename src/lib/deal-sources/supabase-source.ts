import { getSupabase, isSupabaseConfigured } from "../supabase";
import type { Deal, DealsPayload } from "../types";
import type { DealSource } from "./types";

type DealRow = {
  row_index: number;
  date_received: string | null;
  date_received_ms: number | null;
  name: string | null;
  company: string | null;
  sector: string | null;
  website: string | null;
  deck_link: string | null;
  blurb: string | null;
  summary: string | null;
  sender_email: string | null;
  thread_id: string | null;
  action: string | null;
  action_date: string | null;
  status: string | null;
  linkedin: string | null;
  elite_school: string | null;
  rating: string | null;
  worth: string | null;
  owner: string | null;
  channel: string | null;
  ai_rating_stars: number | null;
  ai_worth: string | null;
  ai_summary: string | null;
  ai_via: string | null;
  ai_mode: string | null;
  ai_rated_at: string | null;
  manual_bucket: string | null;
  manual_bucket_at: string | null;
  manual_bucket_by: string | null;
  crm_entry_id: string | null;
  crm_synced_at: string | null;
  deck_summary: string | null;
  deck_text_excerpt: string | null;
  deck_summarized_at: string | null;
  deck_summary_via: string | null;
  linkedin_work_history: string | null;
  linkedin_college: string | null;
  linkedin_enriched_at: string | null;
  linkedin_enrich_via: string | null;
  info_replied_at: string | null;
  info_reply_note: string | null;
  jev_rating_stars?: number | null;
  jev_worth?: string | null;
  jev_summary?: string | null;
  jev_via?: string | null;
  jev_rated_at?: string | null;
};

function rowToDeal(row: DealRow): Deal {
  return {
    id: `row-${row.row_index}`,
    rowIndex: row.row_index,
    dateReceived: row.date_received,
    dateReceivedMs: row.date_received_ms,
    name: row.name ?? "",
    company: row.company ?? "",
    sector: row.sector ?? "",
    website: row.website ?? "",
    deckLink: row.deck_link ?? "",
    blurb: row.blurb ?? "",
    summary: row.summary ?? "",
    senderEmail: row.sender_email ?? "",
    threadId: row.thread_id ?? "",
    action: row.action ?? "",
    actionDate: row.action_date,
    status: row.status ?? "",
    linkedin: row.linkedin ?? "",
    eliteSchool: row.elite_school ?? "",
    rating: row.rating ?? "",
    worth: row.worth ?? "",
    owner: row.owner ?? "",
    channel: row.channel ?? "",
    aiRatingStars: row.ai_rating_stars ?? null,
    aiWorth: row.ai_worth ?? null,
    aiSummary: row.ai_summary ?? null,
    aiVia: row.ai_via ?? null,
    aiMode: row.ai_mode ?? null,
    aiRatedAt: row.ai_rated_at ?? null,
    manualBucket: row.manual_bucket ?? null,
    manualBucketAt: row.manual_bucket_at ?? null,
    manualBucketBy: row.manual_bucket_by ?? null,
    crmEntryId: row.crm_entry_id ?? null,
    crmSyncedAt: row.crm_synced_at ?? null,
    deckSummary: row.deck_summary ?? null,
    deckTextExcerpt: row.deck_text_excerpt ?? null,
    deckSummarizedAt: row.deck_summarized_at ?? null,
    deckSummaryVia: row.deck_summary_via ?? null,
    linkedinWorkHistory: row.linkedin_work_history ?? null,
    linkedinCollege: row.linkedin_college ?? null,
    linkedinEnrichedAt: row.linkedin_enriched_at ?? null,
    linkedinEnrichVia: row.linkedin_enrich_via ?? null,
    infoRepliedAt: row.info_replied_at ?? null,
    infoReplyNote: row.info_reply_note ?? null,
    jevRatingStars: row.jev_rating_stars ?? null,
    jevWorth: row.jev_worth ?? null,
    jevSummary: row.jev_summary ?? null,
    jevVia: row.jev_via ?? null,
    jevRatedAt: row.jev_rated_at ?? null,
  };
}

export type AiOverlayRow = {
  row_index: number;
  ai_rating_stars: number | null;
  ai_worth: string | null;
  ai_summary: string | null;
  ai_via: string | null;
  ai_mode: string | null;
  ai_rated_at: string | null;
  manual_bucket: string | null;
  manual_bucket_at: string | null;
  manual_bucket_by: string | null;
  crm_entry_id: string | null;
  crm_synced_at: string | null;
  deck_summary: string | null;
  deck_text_excerpt: string | null;
  deck_summarized_at: string | null;
  deck_summary_via: string | null;
  linkedin_work_history: string | null;
  linkedin_college: string | null;
  linkedin_enriched_at: string | null;
  linkedin_enrich_via: string | null;
  info_replied_at: string | null;
  info_reply_note: string | null;
  jev_rating_stars?: number | null;
  jev_worth?: string | null;
  jev_summary?: string | null;
  jev_via?: string | null;
  jev_rated_at?: string | null;
};

/** Rating-module / manual-bucket / CRM fields only live in Supabase — the Sheet
 *  doesn't know about them. Fetch them keyed by row_index so the sheet-primary
 *  deals list (system of record for raw fields) can be overlaid with them. */
export async function fetchAiOverlay(): Promise<Map<number, AiOverlayRow>> {
  const map = new Map<number, AiOverlayRow>();
  if (!isSupabaseConfigured) return map;

  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await getSupabase()
      .from("deals")
      .select(
        "row_index, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, jev_rating_stars, jev_worth, jev_summary, jev_via, jev_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at, deck_summary, deck_text_excerpt, deck_summarized_at, deck_summary_via, linkedin_work_history, linkedin_college, linkedin_enriched_at, linkedin_enrich_via, info_replied_at, info_reply_note",
      )
      .range(from, from + PAGE - 1);
    if (error) {
      // Soft-fallback if Jev columns aren't migrated yet.
      if (/jev_rating_stars|jev_worth|jev_summary|jev_via|jev_rated_at/i.test(error.message)) {
        const mid = await getSupabase()
          .from("deals")
          .select(
            "row_index, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at, deck_summary, deck_text_excerpt, deck_summarized_at, deck_summary_via, linkedin_work_history, linkedin_college, linkedin_enriched_at, linkedin_enrich_via, info_replied_at, info_reply_note",
          )
          .range(from, from + PAGE - 1);
        if (mid.error || !mid.data) {
          // fall through to older selects below
        } else {
          for (const row of mid.data as AiOverlayRow[]) {
            map.set(row.row_index, row);
          }
          if (mid.data.length < PAGE) break;
          from += PAGE;
          continue;
        }
      }
      // Soft-fallback if info-reply migration not applied yet.
      if (/info_replied_at|info_reply_note/i.test(error.message)) {
        const mid = await getSupabase()
          .from("deals")
          .select(
            "row_index, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at, deck_summary, deck_text_excerpt, deck_summarized_at, deck_summary_via, linkedin_work_history, linkedin_college, linkedin_enriched_at, linkedin_enrich_via",
          )
          .range(from, from + PAGE - 1);
        if (mid.error || !mid.data) {
          // fall through to older selects below
        } else {
          for (const row of mid.data as Omit<
            AiOverlayRow,
            "info_replied_at" | "info_reply_note"
          >[]) {
            map.set(row.row_index, {
              ...row,
              info_replied_at: null,
              info_reply_note: null,
            });
          }
          if (mid.data.length < PAGE) break;
          from += PAGE;
          continue;
        }
      }
      // Soft-fallback if linkedin migration not applied yet.
      if (/linkedin_work_history|linkedin_college|linkedin_enriched/i.test(error.message)) {
        const mid = await getSupabase()
          .from("deals")
          .select(
            "row_index, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at, deck_summary, deck_text_excerpt, deck_summarized_at, deck_summary_via",
          )
          .range(from, from + PAGE - 1);
        if (mid.error || !mid.data) {
          // fall through to older deck-less select below
        } else {
          for (const row of mid.data as Omit<
            AiOverlayRow,
            | "linkedin_work_history"
            | "linkedin_college"
            | "linkedin_enriched_at"
            | "linkedin_enrich_via"
            | "info_replied_at"
            | "info_reply_note"
          >[]) {
            map.set(row.row_index, {
              ...row,
              linkedin_work_history: null,
              linkedin_college: null,
              linkedin_enriched_at: null,
              linkedin_enrich_via: null,
              info_replied_at: null,
              info_reply_note: null,
            });
          }
          if (mid.data.length < PAGE) break;
          from += PAGE;
          continue;
        }
      }
      // Soft-fallback if deck migration not applied yet.
      if (/deck_summary/i.test(error.message)) {
        const basic = await getSupabase()
          .from("deals")
          .select(
            "row_index, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at",
          )
          .range(from, from + PAGE - 1);
        if (basic.error || !basic.data) break;
        for (const row of basic.data as Omit<
          AiOverlayRow,
          | "deck_summary"
          | "deck_text_excerpt"
          | "deck_summarized_at"
          | "deck_summary_via"
          | "linkedin_work_history"
          | "linkedin_college"
          | "linkedin_enriched_at"
          | "linkedin_enrich_via"
          | "info_replied_at"
          | "info_reply_note"
        >[]) {
          map.set(row.row_index, {
            ...row,
            deck_summary: null,
            deck_text_excerpt: null,
            deck_summarized_at: null,
            deck_summary_via: null,
            linkedin_work_history: null,
            linkedin_college: null,
            linkedin_enriched_at: null,
            linkedin_enrich_via: null,
            info_replied_at: null,
            info_reply_note: null,
          });
        }
        if (basic.data.length < PAGE) break;
        from += PAGE;
        continue;
      }
      break;
    }
    if (!data) break;
    for (const row of data as AiOverlayRow[]) {
      map.set(row.row_index, row);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

/** Reads the synced mirror in Supabase — preferred portal read path. */
export const supabaseSource: DealSource = {
  name: "supabase",
  async fetch(): Promise<DealsPayload> {
    if (!isSupabaseConfigured) {
      throw new Error("Supabase is not configured");
    }

    const PAGE = 1000;
    const rows: DealRow[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await getSupabase()
        .from("deals")
        .select("*")
        .order("date_received_ms", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
      const chunk = (data ?? []) as DealRow[];
      rows.push(...chunk);
      if (chunk.length < PAGE) break;
      from += PAGE;
    }

    const deals = rows.map(rowToDeal);
    return {
      deals,
      count: deals.length,
      fetchedAt: new Date().toISOString(),
      source: "supabase",
    };
  },
};
