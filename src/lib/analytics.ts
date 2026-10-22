import type { Deal } from "./types";
import { classifyStage, type Stage } from "./deal-utils";

/** Parse a rating cell like "8", "8/10", "high" into a 0-10 number. */
export function parseRating(raw: string): number | null {
  if (!raw) return null;
  const frac = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+)/);
  if (frac) {
    const n = Number(frac[1]);
    const d = Number(frac[2]);
    if (d) return Math.round((n / d) * 10 * 10) / 10;
  }
  const num = raw.match(/\d+(?:\.\d+)?/);
  if (num) return Number(num[0]);
  const t = raw.toLowerCase();
  if (/high|strong|great|excellent/.test(t)) return 8;
  if (/medium|mid|okay|ok/.test(t)) return 6;
  if (/low|weak/.test(t)) return 3;
  return null;
}

function isWorthFlag(raw: string): boolean {
  const t = raw.toLowerCase().trim();
  if (!t) return false;
  return /\b(yes|worth|strong|high|call|meet|pursue|partner)\b/.test(t);
}

export type WorthSignal = {
  deal: Deal;
  stage: Stage;
  score: number;
  reasons: string[];
};

/** Score a deal for "worth a call" — higher means more actionable. */
export function scoreDeal(deal: Deal): WorthSignal {
  const stage = classifyStage(deal);
  const reasons: string[] = [];
  let score = 0;

  if (isWorthFlag(deal.worth) || isWorthFlag(deal.aiWorth || "")) {
    score += 5;
    reasons.push("Flagged worth pursuing");
  }

  const rating =
    deal.aiRatingStars != null
      ? deal.aiRatingStars * 2 // map 0-5 → ~0-10 scale used by scoreDeal
      : parseRating(deal.rating);
  if (rating != null) {
    if (rating >= 8) {
      score += 4;
      reasons.push(`High rating (${rating})`);
    } else if (rating >= 6) {
      score += 2;
      reasons.push(`Rating ${rating}`);
    }
  }

  if (deal.eliteSchool) {
    score += 3;
    reasons.push(deal.eliteSchool);
  }

  if (stage === "Meeting") {
    score += 3;
    reasons.push("In meeting stage");
  } else if (stage === "In Review") {
    score += 1.5;
    reasons.push("Under review");
  } else if (stage === "Passed") {
    score -= 10;
  }

  // Recency boost — recent inbound is more actionable.
  if (deal.dateReceivedMs) {
    const days = (Date.now() - deal.dateReceivedMs) / 86_400_000;
    if (days <= 3) score += 1.5;
    else if (days <= 7) score += 0.75;
  }

  return { deal, stage, score, reasons };
}

/** Top deals worth a call (non-passed, positive signal). */
export function worthACall(deals: Deal[], limit = 6): WorthSignal[] {
  return deals
    .map(scoreDeal)
    .filter((s) => s.stage !== "Passed" && s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** dd/MM/yyyy -> epoch ms */
export function parseDMY(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

export type ActivityItem = {
  deal: Deal;
  ts: number;
  kind: "inbound" | "action";
  label: string;
};

/** Merge inbound + actioned events into a recent-activity feed. */
export function recentActivity(deals: Deal[], limit = 10): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const deal of deals) {
    if (deal.dateReceivedMs) {
      items.push({
        deal,
        ts: deal.dateReceivedMs,
        kind: "inbound",
        label: "New inbound",
      });
    }
    const actionMs = parseDMY(deal.actionDate);
    if (actionMs && deal.action) {
      items.push({
        deal,
        ts: actionMs,
        kind: "action",
        label: deal.action,
      });
    }
  }
  return items.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export type TrendBucket = { label: string; count: number; start: number };

/** Inbound counts per week for the last `weeks` weeks (oldest → newest). */
export function weeklyInbound(deals: Deal[], weeks = 8): TrendBucket[] {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const weekMs = 7 * 86_400_000;
  const buckets: TrendBucket[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const end = now.getTime() - i * weekMs;
    const start = end - weekMs;
    buckets.push({
      start,
      count: 0,
      label:
        i === 0
          ? "This wk"
          : i === 1
            ? "Last wk"
            : `${i}w`,
    });
  }

  for (const deal of deals) {
    const ms = deal.dateReceivedMs;
    if (!ms) continue;
    for (const b of buckets) {
      if (ms > b.start && ms <= b.start + weekMs) {
        b.count += 1;
        break;
      }
    }
  }
  return buckets;
}

export type SectorCount = { sector: string; count: number };

export function topSectors(deals: Deal[], limit = 6): SectorCount[] {
  const map = new Map<string, number>();
  for (const d of deals) {
    const s = d.sector?.trim();
    if (!s) continue;
    map.set(s, (map.get(s) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function stageDistribution(deals: Deal[]): Record<Stage, number> {
  const counts: Record<Stage, number> = {
    New: 0,
    "In Review": 0,
    Meeting: 0,
    Passed: 0,
  };
  for (const d of deals) counts[classifyStage(d)] += 1;
  return counts;
}
