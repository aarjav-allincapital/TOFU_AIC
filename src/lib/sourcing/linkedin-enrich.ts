import "server-only";
import { scrapeLinkedInProfile } from "@/lib/linkedin/brightdata";
import { extractLinkedInPreview } from "@/lib/linkedin/normalize";
import type { LinkedInEnrichVia } from "@/lib/linkedin/persist";
import { normalizeLinkedInProfileUrl } from "@/lib/linkedin/url";
import type { SourcedFounder } from "./types";
import {
  loadSourcingLinkedInMap,
  readSourcingLinkedIn,
  shouldRefreshSourcingLinkedIn,
  writeSourcingLinkedIn,
} from "./linkedin-store";

const inflight = new Set<string>();

export function isSourcingLinkedInEnabled(): boolean {
  const token = (process.env.BRIGHTDATA_API_TOKEN || "").trim();
  if (!token) return false;
  if (process.env.ENABLE_SOURCING_LINKEDIN === "0") return false;
  return true;
}

export async function overlaySourcingLinkedIn(
  sourced: SourcedFounder[],
): Promise<SourcedFounder[]> {
  const stored = await loadSourcingLinkedInMap();
  return sourced.map((item) => {
    const url = normalizeLinkedInProfileUrl(item.linkedin);
    if (!url) return item;
    const hit = stored.get(url);
    if (!hit) return item;
    return {
      ...item,
      linkedin: url,
      linkedinPreview: hit.preview,
      linkedinCollege: hit.college,
      linkedinEnrichedAt: hit.enrichedAt,
      linkedinEnrichVia: hit.via,
    };
  });
}

export async function enrichSourcingLinkedInUrl(
  rawUrl: string,
  opts: { force?: boolean } = {},
): Promise<LinkedInEnrichVia | "skipped"> {
  const url = normalizeLinkedInProfileUrl(rawUrl);
  if (!url) return "bad_url";
  if (!isSourcingLinkedInEnabled()) return "disabled";
  if (inflight.has(url)) return "skipped";

  const existing = await readSourcingLinkedIn(url);
  if (!shouldRefreshSourcingLinkedIn(existing, opts)) {
    return existing?.via === "ok" ? "ok" : "skipped";
  }

  inflight.add(url);
  try {
    const scraped = await scrapeLinkedInProfile(url);
    if (!scraped.ok) {
      const via: LinkedInEnrichVia =
        scraped.reason === "no_token"
          ? "no_token"
          : scraped.reason === "bad_url"
            ? "bad_url"
            : scraped.reason === "empty"
              ? "empty"
              : "api_error";
      if (scraped.detail) {
        console.warn(`[sourcing/linkedin] ${via} ${url}:`, scraped.detail.slice(0, 240));
      }
      await writeSourcingLinkedIn({
        url,
        preview: null,
        college: null,
        via,
        enrichedAt: new Date().toISOString(),
      });
      return via;
    }

    const extracted = extractLinkedInPreview(scraped.profile, url);
    const hasContent =
      extracted.preview.name ||
      extracted.preview.experience.length > 0 ||
      extracted.preview.education.length > 0;

    if (!hasContent) {
      await writeSourcingLinkedIn({
        url,
        preview: null,
        college: null,
        via: "empty",
        enrichedAt: new Date().toISOString(),
      });
      return "empty";
    }

    await writeSourcingLinkedIn({
      url,
      preview: extracted.preview,
      college: extracted.college.trim() || null,
      via: "ok",
      enrichedAt: new Date().toISOString(),
    });
    console.log(`[sourcing/linkedin] ok ${extracted.preview.name || url}`);
    return "ok";
  } catch (err) {
    console.warn(
      `[sourcing/linkedin] failed ${url}:`,
      err instanceof Error ? err.message : err,
    );
    await writeSourcingLinkedIn({
      url,
      preview: null,
      college: null,
      via: "api_error",
      enrichedAt: new Date().toISOString(),
    });
    return "api_error";
  } finally {
    inflight.delete(url);
  }
}

export async function enrichMissingSourcingLinkedIn(
  sourced: SourcedFounder[],
  opts: { force?: boolean; limit?: number } = {},
): Promise<{ attempted: number; ok: number }> {
  if (!isSourcingLinkedInEnabled()) return { attempted: 0, ok: 0 };
  const urls: string[] = [];
  for (const item of sourced) {
    const url = normalizeLinkedInProfileUrl(item.linkedin);
    if (!url) continue;
    if (urls.includes(url)) continue;
    if (!opts.force) {
      const stored = await readSourcingLinkedIn(url);
      if (stored) continue;
    }
    urls.push(url);
  }
  const capped =
    opts.limit && opts.limit > 0 ? urls.slice(0, opts.limit) : urls;
  let ok = 0;
  for (const url of capped) {
    const via = await enrichSourcingLinkedInUrl(url, { force: opts.force });
    if (via === "ok") ok += 1;
  }
  return { attempted: capped.length, ok };
}
