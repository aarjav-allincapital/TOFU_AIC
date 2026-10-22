import "server-only";
import type { Deal } from "@/lib/types";
import { fetchDeckPdf } from "./fetch";
import { extractPdfText } from "./extract";
import { formatDeckSummary, summarizeDeckText } from "./summarize";
import { persistDeckSummary, type DeckSummaryVia } from "./persist";

const EXCERPT_CHARS = 8_000;

export function isDeckSummaryEnabled(): boolean {
  return process.env.ENABLE_DECK_SUMMARY === "1";
}

/** Only 5★ or 1★ deals with a non-empty deck link are eligible. */
export function isEligibleForDeckSummary(deal: Deal): boolean {
  const stars = deal.aiRatingStars;
  return (
    Boolean((deal.deckLink || "").trim()) && (stars === 5 || stars === 1)
  );
}

export type SummarizeDeckResult = {
  via: DeckSummaryVia | "skipped_not_eligible";
  summary: string | null;
};

/**
 * Real-time helper: summarize every eligible deal (1★/5★ + deck) with low concurrency.
 * Safe to call from /api/deals `after()` — never throws.
 */
export async function runDeckSummariesForDeals(
  deals: Deal[],
  opts: { concurrency?: number; logPrefix?: string } = {},
): Promise<{ attempted: number; ok: number }> {
  if (!isDeckSummaryEnabled()) return { attempted: 0, ok: 0 };

  const eligible = deals.filter(isEligibleForDeckSummary);
  if (eligible.length === 0) return { attempted: 0, ok: 0 };

  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const prefix = opts.logPrefix || "[deck]";
  let ok = 0;
  let i = 0;

  async function worker() {
    while (i < eligible.length) {
      const idx = i++;
      const deal = eligible[idx]!;
      try {
        const result = await summarizeDealDeck(deal);
        if (result.via === "ok") {
          ok += 1;
          console.log(
            `${prefix} ok row ${deal.rowIndex} ${deal.company || ""} (${deal.aiRatingStars}★)`,
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

/**
 * Fetch → extract → summarize a deal's deckLink.
 * Only runs for 5★ or 1★ + deck. Never throws to callers.
 * Hard fails stamp deck_summarized_at so cron does not retry forever.
 * Ineligible returns without writing so backlog can pick them up later.
 */
export async function summarizeDealDeck(
  deal: Deal,
): Promise<SummarizeDeckResult> {
  if (!isDeckSummaryEnabled()) {
    return { via: "disabled", summary: null };
  }

  if (!isEligibleForDeckSummary(deal)) {
    return { via: "skipped_not_eligible", summary: null };
  }

  const link = (deal.deckLink || "").trim();
  if (!link) {
    await persistDeckSummary(deal.rowIndex, {
      summary: null,
      textExcerpt: null,
      via: "no_link",
    });
    return { via: "no_link", summary: null };
  }

  const fetched = await fetchDeckPdf(link);
  if (!fetched.ok) {
    const via: DeckSummaryVia =
      fetched.reason === "no_link"
        ? "no_link"
        : fetched.reason === "not_pdf"
          ? "not_pdf"
          : "fetch_failed";
    await persistDeckSummary(deal.rowIndex, {
      summary: null,
      textExcerpt: fetched.detail ? fetched.detail.slice(0, 500) : null,
      via,
    });
    return { via, summary: null };
  }

  const extracted = await extractPdfText(fetched.bytes);
  if (!extracted.ok) {
    await persistDeckSummary(deal.rowIndex, {
      summary: null,
      textExcerpt: extracted.detail ? extracted.detail.slice(0, 500) : null,
      via: "empty",
    });
    return { via: "empty", summary: null };
  }

  const excerpt = extracted.text.slice(0, EXCERPT_CHARS);
  try {
    const fields = await summarizeDeckText({
      company: deal.company,
      sector: deal.sector,
      founder: deal.name,
      text: extracted.text,
    });
    const summary = formatDeckSummary(fields);
    await persistDeckSummary(deal.rowIndex, {
      summary,
      textExcerpt: excerpt,
      via: "ok",
    });
    return { via: "ok", summary };
  } catch (err) {
    console.warn(
      `[deck] llm failed for row ${deal.rowIndex}:`,
      err instanceof Error ? err.message : err,
    );
    await persistDeckSummary(deal.rowIndex, {
      summary: null,
      textExcerpt: excerpt,
      via: "llm_failed",
    });
    return { via: "llm_failed", summary: null };
  }
}
