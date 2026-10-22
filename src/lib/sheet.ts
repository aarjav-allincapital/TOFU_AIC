import type { Deal, DealsPayload } from "./types";

/**
 * The Google Sheet is the system of record. An Apps Script ingests inbound
 * founder emails into it. The dashboard reads live via:
 * 1. Apps Script Web App (APPS_SCRIPT_URL) — preferred
 * 2. Public gviz JSON endpoint — fallback
 */
export const SHEET_ID = (process.env.SHEET_ID || "").trim();

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const APPS_SCRIPT_TOKEN = process.env.APPS_SCRIPT_TOKEN;

const GVIZ_URL = (sheetId: string) =>
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;

type GvizCell = { v: unknown; f?: string } | null;
type GvizRow = { c: GvizCell[] };
type GvizTable = {
  cols: { id: string; label: string; type: string }[];
  rows: GvizRow[];
};

/** Column letter -> field. Mapped by the sheet's stable column ids. */
const COLUMN_MAP = {
  A: "dateReceived",
  B: "name",
  C: "company",
  D: "sector",
  E: "website",
  F: "deckLink",
  G: "blurb",
  H: "summary",
  I: "senderEmail",
  J: "threadId",
  K: "action",
  L: "actionDate",
  M: "status",
  N: "linkedin",
  O: "eliteSchool",
  Q: "rating",
  R: "worth",
  S: "owner",
  T: "channel",
} as const;

function stripGvizWrapper(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Unexpected gviz response shape");
  }
  return text.slice(start, end + 1);
}

function clean(value: string): string {
  return value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

function cellString(cell: GvizCell): string {
  if (!cell) return "";
  if (typeof cell.f === "string" && clean(cell.f) !== "") return clean(cell.f);
  if (cell.v == null) return "";
  return clean(String(cell.v));
}

function parseGvizDate(cell: GvizCell): number | null {
  if (!cell || cell.v == null) return null;
  if (typeof cell.v === "string") {
    const m = cell.v.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
    if (m) {
      const [, y, mo, d, h, mi, s] = m;
      return new Date(
        Number(y),
        Number(mo),
        Number(d),
        Number(h ?? 0),
        Number(mi ?? 0),
        Number(s ?? 0),
      ).getTime();
    }
    const parsed = Date.parse(cell.v);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function looksLikeLoginPage(text: string): boolean {
  const t = text.trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html");
}

async function fetchFromAppsScript(): Promise<Deal[]> {
  if (!APPS_SCRIPT_URL) {
    throw new Error("APPS_SCRIPT_URL is not configured");
  }

  const url = new URL(APPS_SCRIPT_URL);
  if (APPS_SCRIPT_TOKEN) {
    url.searchParams.set("token", APPS_SCRIPT_TOKEN);
  }

  const res = await fetch(url.toString(), {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Apps Script fetch failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();

  if (looksLikeLoginPage(text)) {
    throw new Error(
      "Apps Script returned a sign-in page. Redeploy as Anyone or use workspace client fetch.",
    );
  }

  const payload = JSON.parse(text) as DealsPayload & { error?: string };
  if (payload.error) {
    throw new Error(payload.error);
  }
  if (!Array.isArray(payload.deals)) {
    throw new Error("Apps Script response missing deals array");
  }

  // Apps Script doesn't know about rating-module / bucket / CRM fields — fill defaults.
  return payload.deals.map((d) => ({
    ...d,
    owner: d.owner ?? "",
    channel: d.channel ?? "",
    aiRatingStars: d.aiRatingStars ?? null,
    aiWorth: d.aiWorth ?? null,
    aiSummary: d.aiSummary ?? null,
    aiVia: d.aiVia ?? null,
    aiMode: d.aiMode ?? null,
    aiRatedAt: d.aiRatedAt ?? null,
    manualBucket: d.manualBucket ?? null,
    manualBucketAt: d.manualBucketAt ?? null,
    manualBucketBy: d.manualBucketBy ?? null,
    crmEntryId: d.crmEntryId ?? null,
    crmSyncedAt: d.crmSyncedAt ?? null,
    deckSummary: d.deckSummary ?? null,
    deckTextExcerpt: d.deckTextExcerpt ?? null,
    deckSummarizedAt: d.deckSummarizedAt ?? null,
    deckSummaryVia: d.deckSummaryVia ?? null,
    linkedinWorkHistory: d.linkedinWorkHistory ?? null,
    linkedinCollege: d.linkedinCollege ?? null,
    linkedinEnrichedAt: d.linkedinEnrichedAt ?? null,
    linkedinEnrichVia: d.linkedinEnrichVia ?? null,
    jevRatingStars: d.jevRatingStars ?? null,
    jevWorth: d.jevWorth ?? null,
    jevSummary: d.jevSummary ?? null,
    jevVia: d.jevVia ?? null,
    jevRatedAt: d.jevRatedAt ?? null,
  }));
}

async function fetchFromGviz(): Promise<Deal[]> {
  if (!SHEET_ID) {
    throw new Error("SHEET_ID is not set. Add it to .env.local.");
  }
  const res = await fetch(GVIZ_URL(SHEET_ID), {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 (DealFlowDashboard)" },
  });

  if (!res.ok) {
    throw new Error(`Sheet fetch failed: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();
  const json = JSON.parse(stripGvizWrapper(raw)) as {
    status: string;
    table: GvizTable;
  };

  const table = json.table;
  const idByIndex = table.cols.map((c) => c.id);

  const deals: Deal[] = [];

  table.rows.forEach((row, i) => {
    const record: Record<string, string> = {};
    let dateReceivedMs: number | null = null;

    row.c.forEach((cell, colIdx) => {
      const colId = idByIndex[colIdx];
      const field = COLUMN_MAP[colId as keyof typeof COLUMN_MAP];
      if (!field) return;
      if (field === "dateReceived") {
        dateReceivedMs = parseGvizDate(cell);
      }
      record[field] = cellString(cell);
    });

    const company = record.company ?? "";
    const name = record.name ?? "";
    if (!company && !name && !record.senderEmail && !record.blurb) return;

    const threadId = record.threadId ?? "";
    const rowIndex = i + 2;
    deals.push({
      id: `row-${rowIndex}`,
      rowIndex,
      dateReceived: record.dateReceived || null,
      dateReceivedMs,
      name,
      company,
      sector: record.sector ?? "",
      website: record.website ?? "",
      deckLink: record.deckLink ?? "",
      blurb: record.blurb ?? "",
      summary: record.summary ?? "",
      senderEmail: record.senderEmail ?? "",
      threadId,
      action: record.action ?? "",
      actionDate: record.actionDate || null,
      status: record.status ?? "",
      linkedin: record.linkedin ?? "",
      eliteSchool: record.eliteSchool ?? "",
      rating: record.rating ?? "",
      worth: record.worth ?? "",
      owner: record.owner ?? "",
      channel: record.channel ?? "",
      aiRatingStars: null,
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
      jevRatingStars: null,
      jevWorth: null,
      jevSummary: null,
      jevVia: null,
      jevRatedAt: null,
    });
  });

  deals.sort((a, b) => (b.dateReceivedMs ?? 0) - (a.dateReceivedMs ?? 0));
  return deals;
}

/** Fetch deals — Apps Script when configured, otherwise gviz. */
export async function fetchDeals(): Promise<Deal[]> {
  const payload = await fetchDealsPayload();
  return payload.deals;
}

/** Full payload for API responses. */
export async function fetchDealsPayload(): Promise<DealsPayload> {
  if (APPS_SCRIPT_URL) {
    try {
      const deals = await fetchFromAppsScript();
      return {
        deals,
        count: deals.length,
        fetchedAt: new Date().toISOString(),
        source: "apps-script",
      };
    } catch (err) {
      console.warn(
        "[sheet] Apps Script fetch failed, falling back to gviz:",
        err,
      );
    }
  }

  const deals = await fetchFromGviz();
  return {
    deals,
    count: deals.length,
    fetchedAt: new Date().toISOString(),
    source: "sheet",
  };
}
