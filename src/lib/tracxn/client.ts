import "server-only";
import type {
  TracxnInvestor,
  TracxnPerson,
  TracxnProfile,
  TracxnRound,
  TracxnVia,
} from "./types";
import { tracxnDomain } from "./domain";

/**
 * Tracxn REST API v3.0. Header `accessToken`; body `{ view?, filter, from, size }`.
 * Billing is 1 credit per entity returned (misses are free), so every call
 * here is pinned to size 1. The `companyData` view is only allowed with an
 * `id` filter on this plan, so lookups are two calls: domain -> id -> profile.
 */
const BASE = "https://platform.tracxn.com/api/3.0";
const TIMEOUT_MS = 20_000;

type Json = Record<string, unknown>;

export type TracxnLookupResult =
  | { ok: true; profile: TracxnProfile }
  | { ok: false; reason: Exclude<TracxnVia, "ok">; detail?: string };

function token(): string {
  return (process.env.TRACXN_API_KEY || "").trim();
}

export function isTracxnConfigured(): boolean {
  return Boolean(token());
}

async function post(
  path: string,
  body: Json,
): Promise<{ ok: true; data: Json } | { ok: false; reason: Exclude<TracxnVia, "ok">; detail: string }> {
  const key = token();
  if (!key) return { ok: false, reason: "no_token", detail: "TRACXN_API_KEY not set" };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { accessToken: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await res.text();
    let data: Json = {};
    try {
      data = text ? (JSON.parse(text) as Json) : {};
    } catch {
      data = {};
    }
    if (res.ok) return { ok: true, data };
    const message = typeof data.message === "string" ? data.message : text.slice(0, 200);
    if (res.status === 900 || /out of credits|credit limit/i.test(message)) {
      return { ok: false, reason: "out_of_credits", detail: message };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "forbidden", detail: `${res.status} ${message}` };
    }
    return { ok: false, reason: "api_error", detail: `${res.status} ${message}` };
  } catch (err) {
    return {
      ok: false,
      reason: "api_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usdOf(amount: unknown): number | null {
  if (!amount || typeof amount !== "object") return null;
  const usd = (amount as Json).USD;
  if (!usd || typeof usd !== "object") return null;
  return num((usd as Json).value);
}

function dateOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const d = value as Json;
  const y = num(d.year);
  if (!y) return "";
  const m = num(d.month);
  const day = num(d.day);
  if (!m) return String(y);
  const mm = String(m).padStart(2, "0");
  return day ? `${y}-${mm}-${String(day).padStart(2, "0")}` : `${y}-${mm}`;
}

function nameOf(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const n = value as Json;
  if (typeof n.name === "string") return n.name.trim();
  return [str(n.firstName), str(n.lastName)].filter(Boolean).join(" ");
}

function primaryWebsite(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const rows = value.filter((r) => r && typeof r === "object") as Json[];
  const primary = rows.find((r) => str(r.isPrimary).toLowerCase() === "yes") || rows[0];
  return primary ? str(primary.url) : "";
}

function taxonomyNames(value: unknown, type: string): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const chain of value) {
    if (!Array.isArray(chain)) continue;
    for (const node of chain) {
      if (!node || typeof node !== "object") continue;
      const n = node as Json;
      if (str(n.type).toUpperCase() === type && str(n.name)) out.add(str(n.name));
    }
  }
  return [...out].slice(0, 6);
}

function locationOf(raw: Json): string {
  const locations = Array.isArray(raw.locations) ? (raw.locations as Json[]) : [];
  const first = locations.find((l) => l && typeof l === "object");
  if (!first) return "";
  const parts = [nameOf(first.city), nameOf(first.state), nameOf(first.country)].filter(Boolean);
  return [...new Set(parts)].join(", ");
}

export function normalizeTracxnCompany(raw: Json): TracxnProfile {
  const website = primaryWebsite(raw.website);
  const latest = raw.latestFundingRound && typeof raw.latestFundingRound === "object"
    ? (raw.latestFundingRound as Json)
    : null;
  const latestRound: TracxnRound | null = latest
    ? { name: str(latest.name), usd: usdOf(latest.amount), date: dateOf(latest.date) }
    : null;
  const investors: TracxnInvestor[] = Array.isArray(raw.investors)
    ? (raw.investors as Json[])
        .filter((i) => i && typeof i === "object" && str(i.name))
        .slice(0, 12)
        .map((i) => ({
          name: str(i.name),
          type: str(i.investorType) || str(i.type),
          website: primaryWebsite(i.website),
        }))
    : [];
  const keyPeople: TracxnPerson[] = Array.isArray(raw.keyPeople)
    ? (raw.keyPeople as Json[])
        .filter((p) => p && typeof p === "object")
        .map((p) => ({ name: nameOf(p.name), designation: str(p.designation) }))
        .filter((p) => p.name)
        .slice(0, 6)
    : [];
  const employee = raw.latestEmployeeCount && typeof raw.latestEmployeeCount === "object"
    ? (raw.latestEmployeeCount as Json)
    : null;
  const revenue = raw.latestRevenue && typeof raw.latestRevenue === "object"
    ? (raw.latestRevenue as Json)
    : null;
  const valuation = raw.latestValuation && typeof raw.latestValuation === "object"
    ? (raw.latestValuation as Json)
    : null;
  const valuationUsd = valuation && valuation.amount && typeof valuation.amount === "object"
    ? (() => {
        const usd = ((valuation.amount as Json).USD as Json | undefined) || {};
        const min = num(usd.min);
        const max = num(usd.max);
        return min === null && max === null ? null : { min, max };
      })()
    : null;
  const social = raw.socialMediaProfiles && typeof raw.socialMediaProfiles === "object"
    ? (raw.socialMediaProfiles as Json)
    : {};
  const xcorn = raw.xcorn && typeof raw.xcorn === "object" ? str((raw.xcorn as Json).rating) : "";
  const editor = raw.editorRating && typeof raw.editorRating === "object"
    ? (raw.editorRating as Json)
    : null;
  const score = raw.tracxnScore && typeof raw.tracxnScore === "object"
    ? num((raw.tracxnScore as Json).overall)
    : null;
  const incubators = Array.isArray(raw.incubators)
    ? (raw.incubators as Json[])
        .map((i) => {
          const company = i && typeof i === "object" ? (i.company as Json | undefined) : undefined;
          const program = i && typeof i === "object" ? (i.program as Json | undefined) : undefined;
          const batch = i && typeof i === "object" ? (i.batch as Json | undefined) : undefined;
          const name = company ? str(company.name) : "";
          const when = [batch ? str(batch.name) : "", program ? str(program.name) : ""]
            .filter(Boolean)
            .join(" ");
          return name ? (when ? `${name} (${when})` : name) : "";
        })
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    id: str(raw.id),
    name: str(raw.name),
    logo: str(raw.logo),
    website,
    domain: tracxnDomain(website),
    foundedYear: num(raw.foundedYear),
    shortDescription: str(raw.shortDescription),
    detailedDescription: str(raw.detailedDescription).slice(0, 1200),
    location: locationOf(raw),
    stage: str(raw.stage),
    funded: str(raw.funded).toLowerCase() === "yes",
    xcorn,
    totalEquityFundingUsd:
      raw.totalEquityFunding && typeof raw.totalEquityFunding === "object"
        ? usdOf((raw.totalEquityFunding as Json).amount)
        : null,
    latestRound,
    investors,
    keyPeople,
    employeeCount: employee ? num(employee.value) : null,
    employeeCountAsOn: employee ? dateOf(employee.asOnDate) : "",
    revenueUsd: revenue ? usdOf(revenue.amount) : null,
    revenueAsOn: revenue ? dateOf(revenue.asOnDate) : "",
    valuationUsd,
    practiceAreas: taxonomyNames(raw.primaryTaxonomy, "PRACTICE AREA"),
    feeds: taxonomyNames(raw.primaryTaxonomy, "FEED"),
    incubators,
    linkedin: str(social.linkedin),
    twitter: str(social.x) || str(social.twitter),
    tracxnScore: score === null ? null : Math.round(score),
    editorRating: editor ? num(editor.rating) : null,
    editorRationale: editor ? str(editor.rationale) : "",
    lastUpdated: editor ? dateOf(editor.lastUpdatedDate) : "",
  };
}

/** Resolve a domain to a Tracxn company id. Costs 1 credit on a hit, 0 on a miss. */
export async function resolveTracxnIdByDomain(
  domainInput: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; reason: Exclude<TracxnVia, "ok">; detail?: string }> {
  const domain = tracxnDomain(domainInput);
  if (!domain) return { ok: false, reason: "no_domain" };
  const candidates = domain.startsWith("www.") ? [domain] : [domain, `www.${domain}`];
  const res = await post("/companies", {
    filter: { domain: candidates },
    from: 0,
    size: 1,
  });
  if (!res.ok) return res;
  const rows = Array.isArray(res.data.result) ? (res.data.result as Json[]) : [];
  const first = rows.find((r) => r && typeof r === "object" && str(r.id));
  if (!first) return { ok: false, reason: "not_found" };
  return { ok: true, id: str(first.id), name: str(first.name) };
}

/** Full `companyData` view for one id. Costs 1 credit. */
export async function fetchTracxnCompany(id: string): Promise<TracxnLookupResult> {
  if (!/^[a-f0-9]{24}$/i.test(id)) return { ok: false, reason: "api_error", detail: "bad id" };
  const res = await post("/companies", {
    view: "companyData",
    filter: { id: [id] },
    from: 0,
    size: 1,
  });
  if (!res.ok) return res;
  const rows = Array.isArray(res.data.result) ? (res.data.result as Json[]) : [];
  const first = rows.find((r) => r && typeof r === "object");
  if (!first) return { ok: false, reason: "not_found" };
  return { ok: true, profile: normalizeTracxnCompany(first) };
}

/** Domain -> profile. At most 2 credits. */
export async function lookupTracxnByDomain(domain: string): Promise<TracxnLookupResult> {
  const resolved = await resolveTracxnIdByDomain(domain);
  if (!resolved.ok) return resolved;
  return fetchTracxnCompany(resolved.id);
}
