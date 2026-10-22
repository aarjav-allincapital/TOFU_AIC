import type { Deal } from "@/lib/types";
import { EMPTY_JEV_FIELDS } from "@/lib/rating/jev-fields";
import { AttioError, attioFetch, getInboundListSlug, isAttioConfigured } from "./client";

type AttioRecord = {
  id: { record_id: string };
  values?: Record<string, unknown>;
};

type AttioEntry = {
  id: { entry_id: string };
};

type AttrDef = {
  title: string;
  api_slug: string;
  type: "text" | "date" | "number" | "rating";
  is_unique?: boolean;
};

/** Custom attributes we ensure exist on the Inbound list only. */
const INBOUND_ATTRS: AttrDef[] = [
  { title: "Portal Row ID", api_slug: "portal_row_id", type: "text", is_unique: true },
  { title: "Sector", api_slug: "sector", type: "text" },
  { title: "Deck link", api_slug: "deck_link", type: "text" },
  { title: "Status", api_slug: "status", type: "text" },
  { title: "Action", api_slug: "action", type: "text" },
  { title: "Rating", api_slug: "rating", type: "text" },
  { title: "Worth", api_slug: "worth", type: "text" },
  { title: "Founder email", api_slug: "founder_email", type: "text" },
  { title: "Founder name", api_slug: "founder_name", type: "text" },
  { title: "Blurb", api_slug: "blurb", type: "text" },
  { title: "Summary", api_slug: "summary", type: "text" },
  { title: "Date received", api_slug: "date_received", type: "text" },
  { title: "Thread ID", api_slug: "thread_id", type: "text" },
  /** Explicit routing label — e.g. "Human Review" when a 5★ is escalated. */
  { title: "Sent to", api_slug: "sent_to", type: "text" },
  { title: "Stars", api_slug: "stars", type: "text" },
];

let attrsReady = false;
let availableEntrySlugs: Set<string> | null = null;

function extractDomain(website: string): string | null {
  const raw = website.trim();
  if (!raw) return null;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.replace(/^www\./i, "");
    return host.includes(".") ? host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Prefer website domain; else founder email domain (skip free mail hosts). */
function companyDomainForDeal(deal: Deal): string | null {
  const fromSite = extractDomain(deal.website);
  if (fromSite) return fromSite;
  const email = deal.senderEmail.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const host = email.slice(at + 1);
  if (!host.includes(".")) return null;
  const FREE = new Set([
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.in",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "icloud.com",
    "me.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
    "rediffmail.com",
  ]);
  if (FREE.has(host)) return null;
  return host;
}

function isLikelyValidEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  // Reject empties, spaces, missing TLD, and obvious placeholders.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return false;
  if (/^(no-?reply|noreply|n\/a|na|none|test)@/i.test(e)) return false;
  return true;
}

function splitPersonName(name: string): {
  first_name: string;
  last_name: string;
  full_name: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first_name: "Unknown", last_name: "", full_name: "Unknown" };
  }
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: "", full_name: parts[0] };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
    full_name: parts.join(" "),
  };
}

async function listExistingAttrSlugs(list: string): Promise<Set<string>> {
  const res = await attioFetch<{ data: { api_slug: string }[] }>(
    `/lists/${list}/attributes`,
  );
  return new Set((res.data || []).map((a) => a.api_slug));
}

/** Create missing custom attributes on Inbound only (idempotent).
 *  Soft-fails if the API key lacks attribute-write scope — sync still works
 *  with company/person + list membership.
 */
export async function ensureInboundListAttributes(): Promise<void> {
  if (attrsReady) return;
  const list = getInboundListSlug();
  const existing = await listExistingAttrSlugs(list);
  availableEntrySlugs = existing;

  for (const attr of INBOUND_ATTRS) {
    if (existing.has(attr.api_slug)) continue;
    try {
      await attioFetch(`/lists/${list}/attributes`, {
        method: "POST",
        body: JSON.stringify({
          data: {
            title: attr.title,
            api_slug: attr.api_slug,
            type: attr.type,
            is_required: false,
            is_unique: Boolean(attr.is_unique),
            is_multiselect: false,
            config: {},
          },
        }),
      });
      existing.add(attr.api_slug);
    } catch (err) {
      if (err instanceof AttioError && (err.status === 403 || err.status === 400)) {
        // Missing scope or already exists — continue without that attribute.
        continue;
      }
      throw err;
    }
  }

  availableEntrySlugs = existing;
  attrsReady = true;
}

async function createCompanyByName(
  name: string,
  description: string,
): Promise<string> {
  const res = await attioFetch<{ data: AttioRecord }>(`/objects/companies/records`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        values: {
          name,
          ...(description ? { description } : {}),
        },
      },
    }),
  });
  return res.data.id.record_id;
}

async function findCompanyByExactName(name: string): Promise<string | null> {
  const res = await attioFetch<{ data: AttioRecord[] }>(
    `/objects/companies/records/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: { name },
        limit: 1,
      }),
    },
  );
  return res.data?.[0]?.id?.record_id || null;
}

export async function upsertCompany(deal: Deal): Promise<string> {
  const name = deal.company.trim();
  if (!name) {
    throw new Error(
      `Refusing to create an Attio company for row ${deal.rowIndex}: company name is empty.`,
    );
  }
  const domain = companyDomainForDeal(deal);
  const description = [deal.blurb, deal.summary].filter(Boolean).join("\n\n").slice(0, 8000);

  if (domain) {
    try {
      const res = await attioFetch<{ data: AttioRecord }>(
        `/objects/companies/records?matching_attribute=domains`,
        {
          method: "PUT",
          body: JSON.stringify({
            data: {
              values: {
                domains: [domain],
                name,
                ...(description ? { description } : {}),
              },
            },
          }),
        },
      );
      return res.data.id.record_id;
    } catch (err) {
      // Bad/blocked domain → still create the company by name so list entry lands.
      if (!(err instanceof AttioError) || (err.status !== 400 && err.status !== 422)) {
        throw err;
      }
    }
  }

  // Attio cannot assert a company without a domain. Reuse an exact name match
  // before creating, so retries and repeated actions stay idempotent.
  const existing = await findCompanyByExactName(name);
  if (existing) return existing;
  return createCompanyByName(name, description);
}

async function upsertPerson(
  deal: Deal,
  companyRecordId: string,
): Promise<string | null> {
  const email = deal.senderEmail.trim().toLowerCase();
  if (!isLikelyValidEmail(email)) return null;

  const personName = splitPersonName(deal.name || email.split("@")[0] || "Unknown");
  const values: Record<string, unknown> = {
    email_addresses: [email],
    name: [personName],
    company: [{ target_object: "companies", target_record_id: companyRecordId }],
  };
  // Skip linkedin on bulk sync — malformed URLs commonly 400 the whole person PUT.

  try {
    const res = await attioFetch<{ data: AttioRecord }>(
      `/objects/people/records?matching_attribute=email_addresses`,
      {
        method: "PUT",
        body: JSON.stringify({ data: { values } }),
      },
    );
    return res.data.id.record_id;
  } catch (err) {
    // Invalid email / Attio validation — still keep company + list entry.
    if (err instanceof AttioError && (err.status === 400 || err.status === 422)) {
      return null;
    }
    throw err;
  }
}

function entryValuesFromDeal(
  deal: Deal,
  extras: Record<string, string> = {},
): Record<string, string> {
  const stars =
    deal.aiRatingStars != null ? String(deal.aiRatingStars) : "";
  const candidates: Record<string, string> = {
    portal_row_id: String(deal.rowIndex),
    sector: deal.sector,
    deck_link: deal.deckLink,
    status: deal.status,
    action: deal.action,
    rating: deal.rating || (stars ? `${stars}/5` : ""),
    worth: deal.aiWorth || deal.worth,
    founder_email: deal.senderEmail,
    founder_name: deal.name,
    blurb: deal.blurb,
    summary: deal.aiSummary || deal.summary,
    date_received: deal.dateReceived || "",
    thread_id: deal.threadId,
    stars,
    ...extras,
  };

  const allowed = availableEntrySlugs;
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(candidates)) {
    if (!v?.trim()) continue;
    if (allowed && !allowed.has(k)) continue;
    values[k] = v.trim().slice(0, 10000);
  }
  return values;
}

/** Kanban status attribute on the Inbound list (drives the board columns). */
const KANBAN_STATUS_SLUG = process.env.ATTIO_INBOUND_STATUS_SLUG || "new";

/** Brand-new inbound deals always land here on first push. */
export const ATTIO_STAGE_NEW = "New";
export const ATTIO_STAGE_PASSES = "Passes";
export const ATTIO_STAGE_HUMAN_REVIEW = "Human Review";

/**
 * Post-rating Kanban column (automatic only).
 * - 0–1★ / Worth No → Passes
 * - Human Review is NEVER automatic — only when someone picks a call_* bucket
 * - Otherwise New
 */
export function kanbanStageForDeal(deal: Deal): string {
  const stars = deal.aiRatingStars;
  if (stars != null && stars <= 1) return ATTIO_STAGE_PASSES;

  const worth = String(deal.aiWorth || "").toLowerCase();
  if (worth === "no") return ATTIO_STAGE_PASSES;
  return ATTIO_STAGE_NEW;
}

/** Upsert this deal's company into Attio and put it on the Inbound list. */
export async function upsertDealToInbound(
  deal: Deal,
  opts: {
    stage?: string;
    /** Extra list-entry fields (e.g. sent_to: teammate name). */
    entryExtras?: Record<string, string>;
  } = {},
): Promise<{
  companyId: string;
  personId: string | null;
  entryId: string;
}> {
  const list = getInboundListSlug();
  await ensureInboundListAttributes();

  const companyId = await upsertCompany(deal);
  const personId = await upsertPerson(deal, companyId);

  const entry_values: Record<string, unknown> = entryValuesFromDeal(
    deal,
    opts.entryExtras,
  );
  const stage = opts.stage ?? ATTIO_STAGE_NEW;
  if (KANBAN_STATUS_SLUG) {
    entry_values[KANBAN_STATUS_SLUG] = stage;
  }

  const res = await attioFetch<{ data: AttioEntry }>(`/lists/${list}/entries`, {
    method: "PUT",
    body: JSON.stringify({
      data: {
        parent_record_id: companyId,
        parent_object: "companies",
        entry_values,
      },
    }),
  });

  return {
    companyId,
    personId,
    entryId: res.data.id.entry_id,
  };
}

/**
 * After rating: only auto-move 0–1★ → Passes.
 * Human Review is triggered exclusively by a call-bucket action.
 */
export async function syncAttioAfterRating(deal: Deal): Promise<{
  entryId: string;
  stage: string;
} | null> {
  if (!isAttioConfigured()) return null;

  const stars = deal.aiRatingStars;
  if (stars == null) return null;

  if (stars <= 1) {
    const r = await upsertDealToInbound(deal, {
      stage: ATTIO_STAGE_PASSES,
    });
    return { entryId: r.entryId, stage: ATTIO_STAGE_PASSES };
  }

  return null;
}

/**
 * When a teammate picks Call with X → move Attio card to Human Review
 * and set Sent to = that person's name. No star-based auto escalate.
 */
export async function syncAttioOnCallAction(
  deal: Deal,
  sentToName: string,
): Promise<{ entryId: string; stage: string }> {
  const label = sentToName.trim() || ATTIO_STAGE_HUMAN_REVIEW;
  const r = await upsertDealToInbound(deal, {
    stage: ATTIO_STAGE_HUMAN_REVIEW,
    entryExtras: { sent_to: label },
  });
  return { entryId: r.entryId, stage: ATTIO_STAGE_HUMAN_REVIEW };
}

export type AttioSyncResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  errors: { rowIndex: number; company: string; error: string }[];
  pushed: { rowIndex: number; entryId: string }[];
};

/**
 * Push deals into Attio Inbound list only.
 * Processes with limited concurrency to respect write rate limits.
 */
export async function syncDealsToAttioInbound(
  deals: Deal[],
  opts: {
    limit?: number;
    concurrencyPauseMs?: number;
    concurrency?: number;
    /** Force Kanban column (e.g. "Passes"). Defaults via kanbanStageForDeal. */
    stage?: string;
    entryExtras?: Record<string, string>;
  } = {},
): Promise<AttioSyncResult> {
  const started = Date.now();
  const slice = opts.limit ? deals.slice(0, opts.limit) : deals;
  const pause = opts.concurrencyPauseMs ?? 80;
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const errors: AttioSyncResult["errors"] = [];
  const pushed: AttioSyncResult["pushed"] = [];
  let succeeded = 0;

  await ensureInboundListAttributes();

  let i = 0;
  async function worker() {
    while (i < slice.length) {
      const idx = i++;
      const deal = slice[idx];
      try {
        const stage = opts.stage ?? kanbanStageForDeal(deal);
        const res = await upsertDealToInbound(deal, {
          stage,
          entryExtras: opts.entryExtras,
        });
        pushed.push({ rowIndex: deal.rowIndex, entryId: res.entryId });
        succeeded += 1;
      } catch (err) {
        errors.push({
          rowIndex: deal.rowIndex,
          company: deal.company || deal.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (pause > 0) await new Promise((r) => setTimeout(r, pause));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, slice.length) }, () => worker()),
  );

  return {
    attempted: slice.length,
    succeeded,
    failed: errors.length,
    durationMs: Date.now() - started,
    errors: errors.slice(0, 20),
    pushed,
  };
}

const CALL_SENT_TO: Record<string, string> = {
  call_with_aarjav: "Aarjav",
  call_with_siddharth: "Siddharth",
  call_with_kushal: "Kushal Bhagia",
  call_with_simran: "Simran Patel",
  call_with_disha: "Disha Choudhary",
  call_with_aditya1: "Aditya Pratap Singh",
  call_with_aditya2: "Aditya Singh",
};

export function rowToDeal(r: Record<string, unknown>): Deal {
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
    aiWorth: (r.ai_worth as string) ?? null,
    aiSummary: (r.ai_summary as string) ?? null,
    aiVia: (r.ai_via as string) ?? null,
    aiMode: (r.ai_mode as string) ?? null,
    aiRatedAt: (r.ai_rated_at as string) ?? null,
    ...EMPTY_JEV_FIELDS,
    manualBucket: (r.manual_bucket as string) ?? null,
    manualBucketAt: (r.manual_bucket_at as string) ?? null,
    manualBucketBy: (r.manual_bucket_by as string) ?? null,
    crmEntryId: (r.crm_entry_id as string) ?? null,
    crmSyncedAt: (r.crm_synced_at as string) ?? null,
    deckSummary: (r.deck_summary as string) ?? null,
    deckTextExcerpt: (r.deck_text_excerpt as string) ?? null,
    deckSummarizedAt: (r.deck_summarized_at as string) ?? null,
    deckSummaryVia: (r.deck_summary_via as string) ?? null,
    linkedinWorkHistory: (r.linkedin_work_history as string) ?? null,
    linkedinCollege: (r.linkedin_college as string) ?? null,
    linkedinEnrichedAt: (r.linkedin_enriched_at as string) ?? null,
    linkedinEnrichVia: (r.linkedin_enrich_via as string) ?? null,
  };
}

/**
 * Cron/backfill: push portal Pass / call_* deals that still lack crm_entry_id
 * into their Attio Inbound columns (Passes / Human Review).
 */
export async function syncMissingBucketEntriesToAttio(
  limit = 80,
): Promise<{
  passes: { attempted: number; succeeded: number; failed: number };
  calls: { attempted: number; succeeded: number; failed: number };
}> {
  if (!isAttioConfigured()) {
    return {
      passes: { attempted: 0, succeeded: 0, failed: 0 },
      calls: { attempted: 0, succeeded: 0, failed: 0 },
    };
  }

  const { getSupabaseAdminCore, isSupabaseAdminConfigured } = await import(
    "@/lib/supabase-admin-core"
  );
  if (!isSupabaseAdminConfigured) {
    return {
      passes: { attempted: 0, succeeded: 0, failed: 0 },
      calls: { attempted: 0, succeeded: 0, failed: 0 },
    };
  }

  const admin = getSupabaseAdminCore();
  const SELECT =
    "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at";

  const { data: passRows } = await admin
    .from("deals")
    .select(SELECT)
    .eq("manual_bucket", "pass")
    .is("crm_entry_id", null)
    .order("row_index", { ascending: true })
    .limit(limit);

  const passes = (passRows || []).map(rowToDeal);
  let passOk = 0;
  let passFail = 0;
  for (const deal of passes) {
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
      console.warn(
        `[attio-backfill] Pass row ${deal.rowIndex}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const { data: callRows } = await admin
    .from("deals")
    .select(SELECT)
    .like("manual_bucket", "call_with_%")
    .is("crm_entry_id", null)
    .order("row_index", { ascending: true })
    .limit(Math.min(limit, 40));

  const calls = (callRows || []).map(rowToDeal);
  let callOk = 0;
  let callFail = 0;
  for (const deal of calls) {
    const bucket = String(deal.manualBucket || "");
    const sentTo = CALL_SENT_TO[bucket] || ATTIO_STAGE_HUMAN_REVIEW;
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
    } catch (err) {
      callFail += 1;
      console.warn(
        `[attio-backfill] Call row ${deal.rowIndex}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    passes: { attempted: passes.length, succeeded: passOk, failed: passFail },
    calls: { attempted: calls.length, succeeded: callOk, failed: callFail },
  };
}
