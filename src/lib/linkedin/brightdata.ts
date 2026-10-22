import "server-only";

import { normalizeLinkedInProfileUrl } from "./url";

const DATASET_ID =
  process.env.BRIGHTDATA_LINKEDIN_DATASET_ID || "gd_l1viktl72bvl7bjuj0";
const TIMEOUT_MS = 55_000;
const SNAPSHOT_POLL_MS = 3_000;
const SNAPSHOT_MAX_WAIT_MS = 50_000;

export type BrightDataProfile = Record<string, unknown>;

export type BrightDataScrapeResult =
  | { ok: true; profile: BrightDataProfile }
  | { ok: false; reason: "no_token" | "bad_url" | "api_error" | "empty"; detail?: string };

export { normalizeLinkedInProfileUrl };

function getToken(): string | null {
  const t = (process.env.BRIGHTDATA_API_TOKEN || "").trim();
  return t || null;
}

function pickProfile(rows: unknown[]): BrightDataProfile | null {
  const profile = rows.find(
    (r) => r && typeof r === "object" && !(r as { error?: unknown }).error,
  ) as BrightDataProfile | undefined;
  return profile || null;
}

/** Poll async snapshot when sync scrape times out / defers. */
async function fetchSnapshot(
  token: string,
  snapshotId: string,
): Promise<BrightDataScrapeResult> {
  const endpoint = `https://api.brightdata.com/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`;
  const deadline = Date.now() + SNAPSHOT_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      return {
        ok: false,
        reason: "api_error",
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    // 202 = still running
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, SNAPSHOT_POLL_MS));
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        reason: "api_error",
        detail: `snapshot HTTP ${res.status}: ${text.slice(0, 240)}`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        reason: "api_error",
        detail: `snapshot non-JSON: ${text.slice(0, 200)}`,
      };
    }

    const rows = Array.isArray(parsed) ? parsed : [];
    const profile = pickProfile(rows);
    if (!profile) {
      const errRow = rows[0] as { error?: string } | undefined;
      return {
        ok: false,
        reason: "empty",
        detail: errRow?.error ? String(errRow.error) : "no profile in snapshot",
      };
    }
    return { ok: true, profile };
  }

  return {
    ok: false,
    reason: "api_error",
    detail: `snapshot timeout:${snapshotId}`,
  };
}

/**
 * Sync scrape one LinkedIn profile via Bright Data Datasets API.
 * Docs: dataset gd_l1viktl72bvl7bjuj0 — Profiles collect by URL.
 * Body shape: { input: [{ url }] }. Falls back to snapshot poll if deferred.
 */
export async function scrapeLinkedInProfile(
  linkedinUrl: string,
): Promise<BrightDataScrapeResult> {
  const token = getToken();
  if (!token) return { ok: false, reason: "no_token" };

  const url = normalizeLinkedInProfileUrl(linkedinUrl);
  if (!url) return { ok: false, reason: "bad_url" };

  const endpoint =
    `https://api.brightdata.com/datasets/v3/scrape` +
    `?dataset_id=${encodeURIComponent(DATASET_ID)}` +
    `&format=json&include_errors=true`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: [{ url }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "api_error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      reason: "api_error",
      detail: `HTTP ${res.status}: ${text.slice(0, 240)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      reason: "api_error",
      detail: `Non-JSON response: ${text.slice(0, 200)}`,
    };
  }

  // Sync deferred → { snapshot_id } — poll until ready.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (obj.snapshot_id) {
      return fetchSnapshot(token, String(obj.snapshot_id));
    }
  }

  const rows = Array.isArray(parsed) ? parsed : [];
  const profile = pickProfile(rows);
  if (!profile) {
    const errRow = rows[0] as { error?: string } | undefined;
    return {
      ok: false,
      reason: "empty",
      detail: errRow?.error ? String(errRow.error) : "no profile in response",
    };
  }

  return { ok: true, profile };
}
