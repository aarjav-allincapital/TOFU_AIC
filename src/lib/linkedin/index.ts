import "server-only";
import type { Deal } from "@/lib/types";
import {
  normalizeLinkedInProfileUrl,
  scrapeLinkedInProfile,
} from "./brightdata";
import { extractLinkedInPreview } from "./normalize";
import {
  persistLinkedInEnrichment,
  type LinkedInEnrichVia,
} from "./persist";

export function isLinkedInEnrichEnabled(): boolean {
  return process.env.ENABLE_LINKEDIN_BRIGHTDATA === "1";
}

/**
 * Any deal with a LinkedIn /in/ URL that still needs a structured preview.
 * - never enriched, or
 * - legacy plain-text enrich (not JSON preview yet)
 * Pass force=true to always re-scrape.
 */
export function isEligibleForLinkedInEnrich(
  deal: Deal,
  opts: { force?: boolean } = {},
): boolean {
  if (!normalizeLinkedInProfileUrl(deal.linkedin || "")) return false;
  if (opts.force) return true;
  if (!deal.linkedinEnrichedAt) return true;
  // Upgrade old plain-text rows to structured preview JSON.
  const stored = (deal.linkedinWorkHistory || "").trim();
  if (deal.linkedinEnrichVia === "ok" && stored && !stored.startsWith("{")) {
    return true;
  }
  return false;
}

export type EnrichLinkedInResult = {
  via: LinkedInEnrichVia | "skipped_not_eligible";
  workHistory: string | null;
  college: string | null;
};

/**
 * Scrape founder LinkedIn → store structured preview JSON + college names.
 * Never throws to callers.
 */
export async function enrichDealLinkedIn(
  deal: Deal,
  opts: { force?: boolean } = {},
): Promise<EnrichLinkedInResult> {
  if (!isLinkedInEnrichEnabled()) {
    return { via: "disabled", workHistory: null, college: null };
  }
  if (!isEligibleForLinkedInEnrich(deal, opts)) {
    return { via: "skipped_not_eligible", workHistory: null, college: null };
  }

  const url = normalizeLinkedInProfileUrl(deal.linkedin);
  if (!url) {
    await persistLinkedInEnrichment(deal.rowIndex, {
      workHistory: null,
      college: null,
      via: "bad_url",
    });
    return { via: "bad_url", workHistory: null, college: null };
  }

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
      console.warn(
        `[linkedin] scrape ${via} row ${deal.rowIndex}:`,
        scraped.detail.slice(0, 240),
      );
    }
    await persistLinkedInEnrichment(deal.rowIndex, {
      workHistory: null,
      college: null,
      via,
    });
    return { via, workHistory: null, college: null };
  }

  const extracted = extractLinkedInPreview(scraped.profile, url);
  const hasContent =
    extracted.preview.name ||
    extracted.preview.experience.length > 0 ||
    extracted.preview.education.length > 0;

  if (!hasContent) {
    await persistLinkedInEnrichment(deal.rowIndex, {
      workHistory: null,
      college: null,
      via: "empty",
    });
    return { via: "empty", workHistory: null, college: null };
  }

  // Store full structured preview as JSON in work_history column.
  const workHistory = JSON.stringify(extracted.preview);
  const college = extracted.college.trim() || null;

  await persistLinkedInEnrichment(deal.rowIndex, {
    workHistory,
    college,
    via: "ok",
  });
  return { via: "ok", workHistory, college };
}

/** Real-time batch helper — prefer deals that still need a preview. */
export async function runLinkedInEnrichForDeals(
  deals: Deal[],
  opts: {
    concurrency?: number;
    logPrefix?: string;
    force?: boolean;
    /** Cap after filtering eligible deals (default: all eligible). */
    limit?: number;
  } = {},
): Promise<{ attempted: number; ok: number }> {
  if (!isLinkedInEnrichEnabled()) return { attempted: 0, ok: 0 };
  let eligible = deals.filter((d) =>
    isEligibleForLinkedInEnrich(d, { force: opts.force }),
  );
  // Newest first when limit applies.
  eligible = [...eligible].sort(
    (a, b) => (b.dateReceivedMs ?? 0) - (a.dateReceivedMs ?? 0),
  );
  if (opts.limit != null && opts.limit > 0) {
    eligible = eligible.slice(0, opts.limit);
  }
  if (eligible.length === 0) return { attempted: 0, ok: 0 };

  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const prefix = opts.logPrefix || "[linkedin]";
  let ok = 0;
  let i = 0;

  async function worker() {
    while (i < eligible.length) {
      const idx = i++;
      const deal = eligible[idx]!;
      try {
        const result = await enrichDealLinkedIn(deal, { force: opts.force });
        if (result.via === "ok") {
          ok += 1;
          console.log(
            `${prefix} ok row ${deal.rowIndex} ${deal.company || ""}`,
          );
        } else {
          console.log(
            `${prefix} ${result.via} row ${deal.rowIndex} ${deal.company || ""}`,
          );
        }
      } catch (err) {
        console.warn(
          `${prefix} failed row ${deal.rowIndex}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, eligible.length) }, () =>
      worker(),
    ),
  );
  return { attempted: eligible.length, ok };
}
