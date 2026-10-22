import "server-only";
import { isTracxnConfigured, lookupTracxnByDomain } from "@/lib/tracxn/client";
import { tracxnDomain } from "@/lib/tracxn/domain";
import type { TracxnProfile, TracxnVia } from "@/lib/tracxn/types";
import { sourcingBoardKey } from "./board";
import {
  loadSourcingTracxnMap,
  readSourcingTracxn,
  shouldRefreshSourcingTracxn,
  tracxnDomainKey,
  tracxnFounderKey,
  writeSourcingTracxn,
  type StoredSourcingTracxn,
} from "./tracxn-store";
import type { SourcedFounder } from "./types";

const inflight = new Set<string>();
// Once Tracxn says the allocation is exhausted, stop spending calls until restart.
let creditsExhaustedAt = 0;
const CREDITS_PAUSE_MS = 6 * 60 * 60 * 1000;

export function isSourcingTracxnEnabled(): boolean {
  if (!isTracxnConfigured()) return false;
  if (process.env.ENABLE_SOURCING_TRACXN === "0") return false;
  return true;
}

/** Website first; otherwise any URL in the founder's links/raw that looks like a company site. */
export function tracxnDomainFor(item: SourcedFounder): string {
  return tracxnDomain(item.website);
}

export async function overlaySourcingTracxn(sourced: SourcedFounder[]): Promise<SourcedFounder[]> {
  const stored = await loadSourcingTracxnMap();
  if (stored.size === 0) return sourced;
  return sourced.map((item) => {
    const manual = stored.get(tracxnFounderKey(sourcingBoardKey(item)));
    const domain = tracxnDomainFor(item);
    const auto = domain ? stored.get(tracxnDomainKey(domain)) : undefined;
    const hit = manual?.profile ? manual : auto ?? manual;
    if (!hit) return item;
    return {
      ...item,
      tracxn: hit.profile,
      tracxnVia: hit.via,
      tracxnFetchedAt: hit.fetchedAt,
    };
  });
}

async function lookupAndStore(
  key: string,
  domain: string,
): Promise<{ via: TracxnVia; profile: TracxnProfile | null }> {
  const fetchedAt = new Date().toISOString();
  const result = await lookupTracxnByDomain(domain);
  const entry: StoredSourcingTracxn = result.ok
    ? { key, domain, profile: result.profile, via: "ok", fetchedAt }
    : { key, domain, profile: null, via: result.reason, fetchedAt };
  if (!result.ok) {
    if (result.reason === "out_of_credits") creditsExhaustedAt = Date.now();
    if (result.detail && result.reason !== "not_found") {
      console.warn(`[sourcing/tracxn] ${result.reason} ${domain}:`, result.detail.slice(0, 240));
    }
  } else {
    console.log(`[sourcing/tracxn] ok ${result.profile.name || domain}`);
  }
  await writeSourcingTracxn(entry);
  // A manual lookup also seeds the domain cache so other rows with the same site reuse it.
  if (key !== tracxnDomainKey(domain)) {
    await writeSourcingTracxn({ ...entry, key: tracxnDomainKey(domain) });
  }
  return { via: entry.via, profile: entry.profile };
}

export async function enrichSourcingTracxnDomain(
  domainInput: string,
  opts: { force?: boolean; founderKey?: string } = {},
): Promise<{ via: TracxnVia | "skipped"; profile: TracxnProfile | null }> {
  const domain = tracxnDomain(domainInput);
  if (!domain) return { via: "no_domain", profile: null };
  if (!isSourcingTracxnEnabled()) return { via: "disabled", profile: null };
  if (creditsExhaustedAt && Date.now() - creditsExhaustedAt < CREDITS_PAUSE_MS) {
    return { via: "out_of_credits", profile: null };
  }
  const key = opts.founderKey ? tracxnFounderKey(opts.founderKey) : tracxnDomainKey(domain);
  if (inflight.has(key)) return { via: "skipped", profile: null };

  // Reuse a cached domain hit before spending credits (manual links included).
  const cachedDomain = await readSourcingTracxn(tracxnDomainKey(domain));
  if (!opts.force && cachedDomain?.via === "ok" && cachedDomain.profile) {
    if (key !== cachedDomain.key) {
      await writeSourcingTracxn({ ...cachedDomain, key, fetchedAt: new Date().toISOString() });
    }
    return { via: "ok", profile: cachedDomain.profile };
  }
  const existing = await readSourcingTracxn(key);
  if (!shouldRefreshSourcingTracxn(existing, opts)) {
    return { via: existing?.via ?? "skipped", profile: existing?.profile ?? null };
  }

  inflight.add(key);
  try {
    return await lookupAndStore(key, domain);
  } catch (err) {
    console.warn(
      `[sourcing/tracxn] failed ${domain}:`,
      err instanceof Error ? err.message : err,
    );
    await writeSourcingTracxn({
      key,
      domain,
      profile: null,
      via: "api_error",
      fetchedAt: new Date().toISOString(),
    });
    return { via: "api_error", profile: null };
  } finally {
    inflight.delete(key);
  }
}

export async function enrichMissingSourcingTracxn(
  sourced: SourcedFounder[],
  opts: { limit?: number } = {},
): Promise<{ attempted: number; ok: number }> {
  if (!isSourcingTracxnEnabled()) return { attempted: 0, ok: 0 };
  const stored = await loadSourcingTracxnMap();
  const domains: string[] = [];
  for (const item of sourced) {
    const domain = tracxnDomainFor(item);
    if (!domain || domains.includes(domain)) continue;
    if (!shouldRefreshSourcingTracxn(stored.get(tracxnDomainKey(domain)) ?? null)) continue;
    domains.push(domain);
  }
  const capped = opts.limit && opts.limit > 0 ? domains.slice(0, opts.limit) : domains;
  let ok = 0;
  for (const domain of capped) {
    const { via } = await enrichSourcingTracxnDomain(domain);
    if (via === "ok") ok += 1;
    if (via === "out_of_credits" || via === "forbidden" || via === "no_token") break;
  }
  return { attempted: capped.length, ok };
}
