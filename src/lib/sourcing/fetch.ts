import type { SourcedFounder, SourcingPayload } from "./types";
import { extractFounderLinks } from "./links";
import { overlayBoardStages } from "./board-store";
import { withoutHiddenSourcing } from "./hidden";
import {
  isSourcingLinkedInEnabled,
  overlaySourcingLinkedIn,
} from "./linkedin-enrich";
import { normalizeSourcingStatus, parseMitraBlocks } from "./parse";
import { looksLikeLoginPage, parseSourcingSheetId } from "./sheet-id";
import { isSourcingTracxnEnabled, overlaySourcingTracxn } from "./tracxn-enrich";

export const SOURCING_SIGNIN_HINT =
  "Google is blocking unauthenticated access. In Apps Script: Deploy → Manage deployments → Edit → Execute as Me, Who has access: Anyone (not Anyone with a Google account). Confirm in an incognito window — you should see JSON. If Workspace forbids that, share the sourcing spreadsheet Anyone with the link → Viewer and paste the Sheet ID.";

const APPS_SCRIPT_URL = (
  process.env.SOURCING_APPS_SCRIPT_URL || ""
).trim();
const APPS_SCRIPT_TOKEN = (
  process.env.SOURCING_APPS_SCRIPT_TOKEN ||
  process.env.APPS_SCRIPT_TOKEN ||
  ""
).trim();
const SHEET_ID = (process.env.SOURCING_SHEET_ID || "").trim();

const PRIVATE_SHEET_HINT =
  "Sourcing sheet is private, so the portal cannot see new rows. In that Google Sheet: Share → General access → Anyone with the link → Viewer, then refresh.";

function gvizUrl(sheetId: string, tab: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tab)}&headers=1&t=${Date.now()}`;
}

type GvizCell = { v: unknown; f?: string } | null;
type GvizRow = { c: GvizCell[] };
type GvizTable = {
  cols: { id: string; label: string; type: string }[];
  rows: GvizRow[];
};

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

function parseMs(value: string): number | null {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function emptyPayload(partial?: Partial<SourcingPayload>): SourcingPayload {
  return {
    sourced: [],
    count: 0,
    fetchedAt: new Date().toISOString(),
    configured: Boolean(APPS_SCRIPT_URL || SHEET_ID),
    sheetUrl: SHEET_ID
      ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`
      : null,
    source: "unconfigured",
    ...partial,
  };
}

function asRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const rec: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    rec[k] = v == null ? "" : String(v);
  }
  rec.addedAt = rec.addedAt || rec.added_at || "";
  rec.sourceIndex = rec.sourceIndex || rec.source_index || "";
  rec.companyNote = rec.companyNote || rec.company_note || "";
  rec.stageTimeline = rec.stageTimeline || rec.stage_timeline || "";
  rec.addedAtMs = rec.addedAtMs || rec.added_at_ms || "";
  rec.rowIndex = rec.rowIndex || rec.row_index || "";
  return rec;
}

function normalizeList(list: unknown[]): SourcedFounder[] {
  return list
    .map((item, i) => {
      const rec = asRecord(item);
      const rowIndex = Number(rec.rowIndex) || i + 2;
      const founder = rowToFounder(rec, rowIndex);
      if (!founder) return null;
      const ms = Number(rec.addedAtMs);
      if (Number.isFinite(ms) && ms > 0) founder.addedAtMs = ms;
      return founder;
    })
    .filter((item): item is SourcedFounder => Boolean(item));
}

function mapSheetLabel(label: string): string {
  const n = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (LABEL_MAP[n]) return LABEL_MAP[n];
  if (n.includes("sourcing platform")) return "";
  if (n.includes("departure") || n.includes("announcement")) return "post";
  if (n.includes("founder")) return "founder";
  if (n.includes("company") || n.includes("project name")) return "company";
  if (n.includes("domain") || n.includes("sector")) return "domain";
  if (n.includes("time building") || n.includes("months")) return "stageTimeline";
  if (n.includes("github")) return "github";
  if (n.includes("twitter") || n === "x" || n.includes("x.com")) return "twitter";
  if (n.includes("website") || n.includes("site url")) return "website";
  if (n.includes("profile") || n.includes("linkedin")) return "linkedin";
  if (n.includes("pedigree") || n.includes("location")) return "pedigree";
  if (n.includes("unfunded") || n.includes("funding")) return "funding";
  if (n.includes("hardware") || n.includes("architecture")) return "hardware";
  if (n.includes("moat") || n.includes("novelty")) return "moat";
  if (n.includes("tam") || n.includes("market")) return "tam";
  if (n.includes("audit") || n.includes("verification council")) {
    return "auditStatus";
  }
  if (n.includes("discovered") || n.includes("added") || n === "date") {
    return "addedAt";
  }
  if (n === "status" || n.includes("pipeline")) return "status";
  if (n.includes("note")) return "notes";
  if (n.includes("raw") || n.includes("dump")) return "raw";
  return "";
}

function splitCompanyCell(value: string): { company: string; companyNote: string } {
  const m = value.trim().match(/^(.*?)\s*\((.+)\)\s*$/);
  if (m) return { company: m[2].trim(), companyNote: m[1].trim() };
  return { company: value.trim(), companyNote: "" };
}

function rowToFounder(
  rec: Record<string, string>,
  rowIndex: number,
): SourcedFounder | null {
  const founder = rec.founder || rec.name || "";
  const split = splitCompanyCell(rec.company || "");
  const company = split.company;
  const companyNote = rec.companyNote || split.companyNote;
  if (!founder && !company && !rec.domain && !rec.raw && !rec.pedigree) {
    return null;
  }
  const links = extractFounderLinks(
    rec.linkedin,
    rec.github,
    rec.website,
    rec.twitter,
    rec.post,
    rec.raw,
  );
  const pipeline = (rec.status || "").trim().toLowerCase();
  const status =
    pipeline === "watching" ||
    pipeline === "outreach" ||
    pipeline === "passed" ||
    pipeline === "new"
      ? normalizeSourcingStatus(rec.status)
      : "New";
  return {
    rowIndex,
    sourceIndex: rec.sourceIndex || "",
    founder,
    company,
    companyNote,
    linkedin: links.linkedin,
    github: links.github,
    website: links.website,
    twitter: links.twitter,
    domain: rec.domain || "",
    stageTimeline: rec.stageTimeline || "",
    funding: rec.funding || "",
    pedigree: rec.pedigree || "",
    hardware: rec.hardware || "",
    moat: rec.moat || "",
    tam: rec.tam || "",
    auditStatus: rec.auditStatus || "",
    raw: rec.raw || rec.post || "",
    status,
    notes: rec.notes || "",
    addedAt: rec.addedAt || null,
    addedAtMs: parseMs(rec.addedAt || ""),
  };
}

const LABEL_MAP: Record<string, string> = {
  "added at": "addedAt",
  added: "addedAt",
  date: "addedAt",
  "date discovered": "addedAt",
  "#": "sourceIndex",
  index: "sourceIndex",
  founder: "founder",
  "founder name": "founder",
  name: "founder",
  company: "company",
  "company / project name": "company",
  "company / project name (or stealth)": "company",
  "company note": "companyNote",
  linkedin: "linkedin",
  "profile url": "linkedin",
  "profile urls": "linkedin",
  github: "github",
  website: "website",
  twitter: "twitter",
  "x.com": "twitter",
  domain: "domain",
  "domain / sector": "domain",
  "what they are building": "domain",
  stage: "stageTimeline",
  "stage & founding timeline": "stageTimeline",
  "time building": "stageTimeline",
  "time building (months)": "stageTimeline",
  funding: "funding",
  "funding status": "funding",
  "unfunded & non-funding verification summary": "funding",
  pedigree: "pedigree",
  "pedigree & traction": "pedigree",
  "location & technical pedigree": "pedigree",
  "hardware & technical architecture teardown": "hardware",
  "engineering moat & novelty": "moat",
  "target market & tam": "tam",
  "verification council audit status": "auditStatus",
  raw: "raw",
  status: "status",
  notes: "notes",
};

async function fetchFromAppsScript(): Promise<SourcingPayload> {
  if (!APPS_SCRIPT_URL) throw new Error("SOURCING_APPS_SCRIPT_URL empty");
  const url = new URL(APPS_SCRIPT_URL);
  if (APPS_SCRIPT_TOKEN) url.searchParams.set("token", APPS_SCRIPT_TOKEN);
  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  if (looksLikeLoginPage(text)) {
    throw new Error(SOURCING_SIGNIN_HINT);
  }
  const payload = JSON.parse(text) as SourcingPayload & { error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!Array.isArray(payload.sourced)) {
    throw new Error("Sourcing Apps Script missing sourced array.");
  }
  const sourced = sortNewest(normalizeList(payload.sourced));
  return {
    ...payload,
    sourced,
    configured: true,
    count: sourced.length,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    source: "apps-script",
  };
}

function isPrivateSheetResponse(status: number, text: string): boolean {
  return status === 401 || status === 403 || looksLikeLoginPage(text);
}

function looksLikeDateCell(value: string): boolean {
  const s = value.trim();
  if (!s || /^\d+\.\s+/.test(s)) return false;
  return /^\d{4}-\d{2}-\d{2}/.test(s) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s);
}

function founderKey(founder: string, company: string): string {
  return `${founder.trim().toLowerCase()}|${company.trim().toLowerCase()}`;
}

function sortNewest(rows: SourcedFounder[]): SourcedFounder[] {
  return [...rows].sort((a, b) => {
    if (b.rowIndex !== a.rowIndex) return b.rowIndex - a.rowIndex;
    return (b.addedAtMs ?? 0) - (a.addedAtMs ?? 0);
  });
}

function payloadScore(p: SourcingPayload): [number, number] {
  const maxRow = p.sourced.reduce((m, r) => Math.max(m, r.rowIndex || 0), 0);
  return [maxRow, p.sourced.length];
}

function pickRicher(
  a: SourcingPayload | null,
  b: SourcingPayload | null,
): SourcingPayload | null {
  if (!a) return b;
  if (!b) return a;
  const [aMax, aN] = payloadScore(a);
  const [bMax, bN] = payloadScore(b);
  if (bN === 0) return a;
  if (aN === 0) return b;
  if (bMax !== aMax) return bMax > aMax ? b : a;
  return bN > aN ? b : a;
}

/**
 * Sheet cell for Hephos is Date(2026,10,8), which Google shows as 8 Nov.
 * The team date is 8 Oct 2026. The sourcing sheet is not writable from here.
 */
const ADDED_AT_CORRECTIONS: { company: RegExp; addedAt: string; addedAtMs: number }[] = [
  {
    company: /^hephos$/i,
    addedAt: "8 Oct 2026",
    addedAtMs: Date.parse("2026-10-08T00:00:00+05:30"),
  },
];

function correctAddedAt(rows: SourcedFounder[]): SourcedFounder[] {
  return rows.map((row) => {
    const fix = ADDED_AT_CORRECTIONS.find((item) => item.company.test(row.company || ""));
    if (!fix) return row;
    return { ...row, addedAt: fix.addedAt, addedAtMs: fix.addedAtMs };
  });
}

async function withLinkedIn(payload: SourcingPayload): Promise<SourcingPayload> {
  const sourced = sortNewest(
    correctAddedAt(
      await overlayBoardStages(
        await overlaySourcingTracxn(
          await overlaySourcingLinkedIn(withoutHiddenSourcing(payload.sourced)),
        ),
      ),
    ),
  );
  return {
    ...payload,
    sourced,
    count: sourced.length,
    linkedinEnabled: isSourcingLinkedInEnabled(),
    tracxnEnabled: isSourcingTracxnEnabled(),
  };
}

async function fetchGvizTable(
  sheetId: string,
  tab: string,
): Promise<GvizTable | null> {
  const res = await fetch(gvizUrl(sheetId, tab), {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 (TOFU-Sourcing)" },
  });
  const text = await res.text();
  if (isPrivateSheetResponse(res.status, text)) {
    throw new Error(PRIVATE_SHEET_HINT);
  }
  if (!res.ok) {
    throw new Error(`Sourcing sheet fetch failed: ${res.status}`);
  }
  try {
    const json = JSON.parse(stripGvizWrapper(text)) as {
      status?: string;
      table?: GvizTable;
    };
    if (!json.table || json.status === "error") return null;
    return json.table;
  } catch {
    return null;
  }
}

function sourcedFromTable(table: GvizTable): SourcedFounder[] {
  const labels = table.cols.map((c) => mapSheetLabel(String(c.label || "")));
  const sourced: SourcedFounder[] = [];
  table.rows.forEach((row, i) => {
    const rec: Record<string, string> = {};
    row.c.forEach((cell, colIdx) => {
      const field = labels[colIdx];
      if (!field) return;
      const value = cellString(cell);
      if (value && !rec[field]) rec[field] = value;
    });
    const founder = rowToFounder(rec, i + 2);
    if (founder) sourced.push(founder);
  });
  return sourced;
}

function mitraBlobFromTable(table: GvizTable): string {
  return table.rows
    .map((row) => {
      const cells = (row.c || []).map(cellString);
      const parts = cells.filter((cell, i) => {
        if (!cell.trim()) return false;
        if (i === 0 && looksLikeDateCell(cell) && cells.length > 1) return false;
        return true;
      });
      return parts.join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

async function fetchFromGviz(sheetId: string): Promise<SourcingPayload> {
  const id = parseSourcingSheetId(sheetId);
  if (!id) throw new Error("SOURCING_SHEET_ID empty");

  const sourcedTable = await fetchGvizTable(id, "Sourced");
  const mitraTable = await fetchGvizTable(id, "Mitra");

  const sourced = sourcedTable ? sourcedFromTable(sourcedTable) : [];
  const byKey = new Map<string, number>();
  sourced.forEach((row, i) => {
    const key = founderKey(row.founder, row.company);
    if (key === "|") return;
    const existing = byKey.get(key);
    if (existing == null || row.rowIndex > sourced[existing].rowIndex) {
      byKey.set(key, i);
    }
  });

  if (mitraTable) {
    const parsed = parseMitraBlocks(mitraBlobFromTable(mitraTable));
    parsed.forEach((item, i) => {
      const key = founderKey(item.founder, item.company);
      const idx = key !== "|" ? byKey.get(key) : undefined;
      if (idx != null) {
        const existing = sourced[idx];
        sourced[idx] = {
          ...existing,
          ...item,
          status: existing.status,
          notes: existing.notes,
          addedAt: existing.addedAt,
          addedAtMs: existing.addedAtMs,
          rowIndex: existing.rowIndex,
        };
        return;
      }
      sourced.push({
        ...item,
        rowIndex: -(i + 1),
        status: "New",
        notes: "",
        addedAt: null,
        addedAtMs: null,
      });
      if (key !== "|") byKey.set(key, sourced.length - 1);
    });
  }

  const keep = new Set(byKey.values());
  const unique = sourced.filter((row, i) => {
    const key = founderKey(row.founder, row.company);
    if (key === "|") return true;
    return keep.has(i);
  });
  const ordered = sortNewest(unique);
  return {
    sourced: ordered,
    count: ordered.length,
    fetchedAt: new Date().toISOString(),
    configured: true,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
    source: "sheet",
  };
}

export function isSourcingConfigured(): boolean {
  return Boolean(APPS_SCRIPT_URL || SHEET_ID);
}

export async function fetchSourcingPayload(opts?: {
  sheetId?: string | null;
}): Promise<SourcingPayload> {
  const sheetId = parseSourcingSheetId(opts?.sheetId) || SHEET_ID || "";
  const sheetUrl = sheetId
    ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
    : null;

  let gviz: SourcingPayload | null = null;
  let gvizErr: string | null = null;
  if (sheetId) {
    try {
      gviz = await fetchFromGviz(sheetId);
    } catch (err) {
      gvizErr = err instanceof Error ? err.message : "Sourcing sheet failed";
    }
  }
  if (gviz && gviz.sourced.length > 0) return withLinkedIn(gviz);

  let script: SourcingPayload | null = null;
  let scriptErr: string | null = null;
  if (APPS_SCRIPT_URL) {
    try {
      script = await fetchFromAppsScript();
    } catch (err) {
      console.warn("[sourcing] Apps Script fetch failed:", err);
      scriptErr = err instanceof Error ? err.message : "Sourcing fetch failed";
    }
  }

  const chosen = pickRicher(gviz, script);
  if (chosen) return withLinkedIn(chosen);

  return withLinkedIn(
    emptyPayload({
      error: gvizErr || scriptErr || undefined,
      configured: Boolean(sheetId || APPS_SCRIPT_URL),
      sheetUrl,
    }),
  );
}
