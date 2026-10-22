import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { TracxnProfile, TracxnVia } from "@/lib/tracxn/types";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "../supabase-admin-core";

/**
 * Keys:
 *   domain:<host>       automatic lookup for a sourced company's website
 *   founder:<boardKey>  a manual "Find on Tracxn" link for a founder with no site
 */
export type StoredSourcingTracxn = {
  key: string;
  domain: string;
  profile: TracxnProfile | null;
  via: TracxnVia;
  fetchedAt: string;
};

const FILE = path.join(process.cwd(), ".data", "sourcing-tracxn.json");
const RETRY_MS = 7 * 24 * 60 * 60 * 1000; // misses are free, but don't hammer
const ERROR_RETRY_MS = 60 * 60 * 1000;

let cache: Record<string, StoredSourcingTracxn> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let supabaseMissing = false;
// Until supabase/migrate-sourcing-tracxn.sql is run, rows live in the existing
// sourcing_linkedin table under a "tracxn:" url prefix so prod stays durable.
let dedicatedTableMissing = false;
const FALLBACK_PREFIX = "tracxn:";
const FALLBACK_TABLE = "sourcing_linkedin";

export function tracxnDomainKey(domain: string): string {
  return `domain:${domain}`;
}

export function tracxnFounderKey(boardKey: string): string {
  return `founder:${boardKey}`;
}

async function loadFile(): Promise<Record<string, StoredSourcingTracxn>> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(FILE, "utf8")) as Record<string, StoredSourcingTracxn>;
  } catch {
    cache = {};
  }
  return cache;
}

function pickNewer(
  a: StoredSourcingTracxn | undefined,
  b: StoredSourcingTracxn | undefined,
): StoredSourcingTracxn | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a.fetchedAt) >= Date.parse(b.fetchedAt) ? a : b;
}

function rowToEntry(
  key: string,
  domain: unknown,
  profile: unknown,
  via: unknown,
  fetchedAt: unknown,
): StoredSourcingTracxn {
  return {
    key,
    domain: String(domain || ""),
    profile: (profile as TracxnProfile | null) ?? null,
    via: (via as TracxnVia) || "api_error",
    fetchedAt: fetchedAt
      ? new Date(fetchedAt as string).toISOString()
      : new Date(0).toISOString(),
  };
}

async function loadFallbackAll(): Promise<Record<string, StoredSourcingTracxn>> {
  const { data, error } = await getSupabaseAdminCore()
    .from(FALLBACK_TABLE)
    .select("url, preview, via, enriched_at")
    .like("url", `${FALLBACK_PREFIX}%`);
  if (error) throw new Error(error.message);
  const out: Record<string, StoredSourcingTracxn> = {};
  for (const row of data || []) {
    const key = String(row.url || "").slice(FALLBACK_PREFIX.length);
    const stored = (row.preview || {}) as { type?: unknown; domain?: unknown; profile?: unknown };
    if (!key || stored.type !== "tracxn") continue;
    out[key] = rowToEntry(key, stored.domain, stored.profile, row.via, row.enriched_at);
  }
  return out;
}

async function loadSupabaseAll(): Promise<Record<string, StoredSourcingTracxn>> {
  if (!isSupabaseAdminConfigured || supabaseMissing) return {};
  try {
    if (!dedicatedTableMissing) {
      const { data, error } = await getSupabaseAdminCore()
        .from("sourcing_tracxn")
        .select("key, domain, profile, via, fetched_at");
      if (!error) {
        const out: Record<string, StoredSourcingTracxn> = {};
        for (const row of data || []) {
          const key = String(row.key || "");
          if (!key) continue;
          out[key] = rowToEntry(key, row.domain, row.profile, row.via, row.fetched_at);
        }
        return out;
      }
      dedicatedTableMissing = true;
      console.warn(
        "[sourcing/tracxn] sourcing_tracxn missing — storing under sourcing_linkedin tracxn:* rows. Run supabase/migrate-sourcing-tracxn.sql.",
      );
    }
    return await loadFallbackAll();
  } catch (err) {
    supabaseMissing = true;
    console.warn(
      "[sourcing/tracxn] Supabase read failed:",
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

async function writeSupabase(entry: StoredSourcingTracxn): Promise<void> {
  if (!isSupabaseAdminConfigured || supabaseMissing) return;
  try {
    const db = getSupabaseAdminCore();
    if (!dedicatedTableMissing) {
      const { error } = await db.from("sourcing_tracxn").upsert(
        {
          key: entry.key,
          domain: entry.domain,
          profile: entry.profile,
          via: entry.via,
          fetched_at: entry.fetchedAt,
        },
        { onConflict: "key" },
      );
      if (!error) return;
      dedicatedTableMissing = true;
    }
    const { error } = await db.from(FALLBACK_TABLE).upsert(
      {
        url: `${FALLBACK_PREFIX}${entry.key}`,
        preview: { type: "tracxn", domain: entry.domain, profile: entry.profile },
        college: null,
        via: entry.via,
        enriched_at: entry.fetchedAt,
      },
      { onConflict: "url" },
    );
    if (error) {
      supabaseMissing = true;
      console.warn("[sourcing/tracxn] Supabase write failed:", error.message);
    }
  } catch (err) {
    supabaseMissing = true;
    console.warn(
      "[sourcing/tracxn] Supabase write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function loadSourcingTracxnMap(): Promise<Map<string, StoredSourcingTracxn>> {
  const file = await loadFile();
  const remote = await loadSupabaseAll();
  const map = new Map<string, StoredSourcingTracxn>();
  for (const [key, entry] of Object.entries(file)) map.set(key, entry);
  for (const [key, entry] of Object.entries(remote)) {
    const merged = pickNewer(map.get(key), entry);
    if (merged) map.set(key, merged);
  }
  return map;
}

export async function readSourcingTracxn(key: string): Promise<StoredSourcingTracxn | null> {
  const map = await loadSourcingTracxnMap();
  return map.get(key) ?? null;
}

export async function writeSourcingTracxn(entry: StoredSourcingTracxn): Promise<void> {
  const run = async () => {
    const data = await loadFile();
    data[entry.key] = entry;
    cache = data;
    try {
      await mkdir(path.dirname(FILE), { recursive: true });
      await writeFile(FILE, JSON.stringify(data), "utf8");
    } catch (err) {
      console.warn(
        "[sourcing/tracxn] file write failed:",
        err instanceof Error ? err.message : err,
      );
    }
    await writeSupabase(entry);
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
}

/** Hits are kept for good (credits were spent). Misses retry weekly, errors hourly. */
export function shouldRefreshSourcingTracxn(
  stored: StoredSourcingTracxn | null,
  opts: { force?: boolean } = {},
): boolean {
  if (opts.force) return true;
  if (!stored) return true;
  if (stored.via === "ok" && stored.profile) return false;
  const at = Date.parse(stored.fetchedAt);
  if (!Number.isFinite(at)) return true;
  const age = Date.now() - at;
  if (stored.via === "not_found" || stored.via === "no_domain") return age > RETRY_MS;
  return age > ERROR_RETRY_MS;
}
