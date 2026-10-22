import type { Deal } from "./types";

export type DateFilter = "all" | "today" | "7d" | "30d" | "90d";

export const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all: "All dates",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export function passesDateFilter(deal: Deal, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const ms = deal.dateReceivedMs;
  if (!ms) return false;

  const now = Date.now();
  if (filter === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return ms >= start.getTime();
  }
  const days =
    filter === "7d" ? 7 : filter === "30d" ? 30 : 90;
  return ms >= now - days * 24 * 60 * 60 * 1000;
}
