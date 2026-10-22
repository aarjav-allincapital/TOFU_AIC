import type { Deal } from "../types";

/** Inbound deals removed from the portal. The Founders sheet is left as-is. */
const HIDDEN_COMPANIES = new Set([
  // EdVenture — Virag (svirag971@gmail.com), row 4228
  "edventure",
]);

export function withoutHiddenDeals(deals: Deal[]): Deal[] {
  return deals.filter(
    (deal) => !HIDDEN_COMPANIES.has(deal.company.trim().toLowerCase()),
  );
}
