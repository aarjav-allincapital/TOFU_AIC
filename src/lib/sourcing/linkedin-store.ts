import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { LinkedInPreview } from "@/lib/linkedin/preview";
import type { LinkedInEnrichVia } from "@/lib/linkedin/persist";
import { normalizeLinkedInProfileUrl } from "@/lib/linkedin/url";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "../supabase-admin-core";

export type StoredSourcingLinkedIn = {
  url: string;
  preview: LinkedInPreview | null;
  college: string | null;
  via: LinkedInEnrichVia;
  enrichedAt: string;
};

const FILE = path.join(process.cwd(), ".data", "sourcing-linkedin.json");
const RETRY_MS = 60 * 60 * 1000;

let cache: Record<string, StoredSourcingLinkedIn> | null = null;
let writeChain: Promise<void> = Promise.resolve();
let supabaseMissing = false;

async function loadFile(): Promise<Record<string, StoredSourcingLinkedIn>> {
  if (cache) return cache;
  try {
    const raw = await readFile(FILE, "utf8");
    cache = JSON.parse(raw) as Record<string, StoredSourcingLinkedIn>;
  } catch {
    cache = {};
  }
  return cache;
}

function pickNewer(
  a: StoredSourcingLinkedIn | null | undefined,
  b: StoredSourcingLinkedIn | null | undefined,
): StoredSourcingLinkedIn | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a.enrichedAt) >= Date.parse(b.enrichedAt) ? a : b;
}

async function loadSupabaseAll(): Promise<Record<string, StoredSourcingLinkedIn>> {
  if (!isSupabaseAdminConfigured || supabaseMissing) return {};
  try {
    const admin = getSupabaseAdminCore();
    const { data, error } = await admin
      .from("sourcing_linkedin")
      .select("url, preview, college, via, enriched_at");
    if (error) {
      supabaseMissing = true;
      console.warn(
        "[sourcing/linkedin] Supabase table missing — using .data/sourcing-linkedin.json. Run supabase/migrate-sourcing-linkedin.sql.",
      );
      return {};
    }
    const out: Record<string, StoredSourcingLinkedIn> = {};
    for (const row of data || []) {
      const url = normalizeLinkedInProfileUrl(String(row.url || ""));
      if (!url) continue;
      out[url] = {
        url,
        preview: (row.preview as LinkedInPreview | null) ?? null,
        college: (row.college as string | null) ?? null,
        via: (row.via as LinkedInEnrichVia) || "api_error",
        enrichedAt: row.enriched_at
          ? new Date(row.enriched_at as string).toISOString()
          : new Date(0).toISOString(),
      };
    }
    return out;
  } catch (err) {
    supabaseMissing = true;
    console.warn(
      "[sourcing/linkedin] Supabase read failed:",
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

async function writeSupabase(entry: StoredSourcingLinkedIn): Promise<void> {
  if (!isSupabaseAdminConfigured || supabaseMissing) return;
  try {
    const admin = getSupabaseAdminCore();
    const { error } = await admin.from("sourcing_linkedin").upsert(
      {
        url: entry.url,
        preview: entry.preview,
        college: entry.college,
        via: entry.via,
        enriched_at: entry.enrichedAt,
      },
      { onConflict: "url" },
    );
    if (error) {
      supabaseMissing = true;
      console.warn("[sourcing/linkedin] Supabase write failed:", error.message);
    }
  } catch (err) {
    supabaseMissing = true;
    console.warn(
      "[sourcing/linkedin] Supabase write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function loadSourcingLinkedInMap(): Promise<
  Map<string, StoredSourcingLinkedIn>
> {
  const file = await loadFile();
  const remote = await loadSupabaseAll();
  const map = new Map<string, StoredSourcingLinkedIn>();
  for (const [url, entry] of Object.entries(file)) {
    map.set(url, entry);
  }
  for (const [url, entry] of Object.entries(remote)) {
    const merged = pickNewer(map.get(url), entry);
    if (merged) map.set(url, merged);
  }
  return map;
}

export async function readSourcingLinkedIn(
  url: string,
): Promise<StoredSourcingLinkedIn | null> {
  const key = normalizeLinkedInProfileUrl(url);
  if (!key) return null;
  const map = await loadSourcingLinkedInMap();
  return map.get(key) ?? null;
}

export async function writeSourcingLinkedIn(
  entry: StoredSourcingLinkedIn,
): Promise<void> {
  const key = normalizeLinkedInProfileUrl(entry.url);
  if (!key) return;
  const stored = { ...entry, url: key };
  const run = async () => {
    const data = await loadFile();
    data[key] = stored;
    cache = data;
    try {
      await mkdir(path.dirname(FILE), { recursive: true });
      await writeFile(FILE, JSON.stringify(data), "utf8");
    } catch (err) {
      console.warn(
        "[sourcing/linkedin] file write failed:",
        err instanceof Error ? err.message : err,
      );
    }
    await writeSupabase(stored);
  };
  writeChain = writeChain.then(run, run);
  await writeChain;
}

export function shouldRefreshSourcingLinkedIn(
  stored: StoredSourcingLinkedIn | null,
  opts: { force?: boolean } = {},
): boolean {
  if (opts.force) return true;
  if (!stored) return true;
  if (stored.via === "ok" && stored.preview) return false;
  const at = Date.parse(stored.enrichedAt);
  if (!Number.isFinite(at)) return true;
  return Date.now() - at > RETRY_MS;
}
