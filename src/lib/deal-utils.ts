import type { Deal } from "./types";

export type Stage = "New" | "In Review" | "Meeting" | "Passed";

/** Pipeline tabs. New is not a column — untouched deals stay under All. */
export const STAGE_ORDER: Stage[] = ["In Review", "Meeting", "Passed"];

export const STAGE_STYLES: Record<
  Stage,
  { label: string; dot: string; badge: string }
> = {
  New: {
    label: "New",
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 border-blue-100",
  },
  "In Review": {
    label: "In Review",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border-amber-100",
  },
  Meeting: {
    label: "Meeting",
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-100",
  },
  Passed: {
    label: "Passed",
    dot: "bg-neutral-400",
    badge: "bg-neutral-100 text-neutral-500 border-neutral-200",
  },
};

/** Derive a pipeline stage from portal bucket first, then stars, then Status / Action text. */
export function classifyStage(deal: Deal): Stage {
  const bucket = (deal.manualBucket || "").trim().toLowerCase();
  if (
    bucket === "pass" ||
    bucket === "pass_temporary" ||
    bucket === "pass_by_aditya"
  ) {
    return "Passed";
  }
  if (bucket.startsWith("call_with_")) return "Meeting";
  // 4★ and 5★ belong on In Review unless a person already passed or booked a call.
  if ((deal.aiRatingStars ?? 0) >= 4) return "In Review";
  if (bucket === "request_info") return "In Review";

  const text = `${deal.status} ${deal.action}`.toLowerCase().trim();
  if (!text) return "New";
  if (/\bmet\b|meeting|call\b/.test(text)) return "Meeting";
  if (/\bpass\b|passed|— no\b|- no\b|\bno\b/.test(text)) return "Passed";
  return "In Review";
}

export function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Best-effort: turn a bare domain into a link, ignore prose. */
export function toHref(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (isUrl(v)) return v;
  if (/^www\.[^\s]+\.[^\s]+$/i.test(v)) return `https://${v}`;
  if (/^[a-z0-9-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(v) && !v.includes(" ")) {
    return `https://${v}`;
  }
  return null;
}

export function prettyDomain(value: string): string {
  const href = toHref(value);
  if (!href) return value;
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function initials(company: string, name: string): string {
  const base = (company || name || "").trim();
  if (!base) return "—";
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function relativeTime(ms: number | null): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  return `${mo}mo ago`;
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  // The sheet already formats these; keep just the date portion for the table.
  return value.split(" ")[0] ?? value;
}

/** One-off pinned highlight — Musubi inbound row. */
export function isPinnedHighlight(deal: Deal, dismissed = false): boolean {
  if (dismissed) return false;
  return deal.company?.trim().toLowerCase() === "musubi";
}

export function isDealHighlighted(
  deal: Deal,
  isUnread: boolean,
  pinnedDismissed = false,
): boolean {
  return isUnread || isPinnedHighlight(deal, pinnedDismissed);
}
