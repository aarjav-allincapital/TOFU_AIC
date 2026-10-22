import type { Deal } from "./types";

/**
 * Inbox attribution. Each triage agent stamps the founder row it ingests with
 * an `owner` (which inbox) and `channel` (direct vs superdm) on the shared
 * Sheet. The portal uses these to give a teammate a view of only their own
 * dealflow while the main dashboard still sees everything.
 */
export type DealOwner = "kb" | "aditya" | "team";

/** Human labels for the main-dashboard inbox filter. */
export const OWNER_LABELS: Record<DealOwner, string> = {
  kb: "KB",
  aditya: "Aditya",
  team: "SuperDM",
};

/**
 * Map a logged-in teammate to an inbox owner tag to LOCK their view to only
 * their own dealflow. Anyone not listed here (Kushal, Aarjav, Simran, …) gets
 * the full cross-inbox view with the All · KB · Aditya filter.
 */
const EMAIL_TO_OWNER: Record<string, DealOwner> = {
  "adityasingh@allincapital.vc": "aditya",
};

/**
 * Teammates whose dashboard is locked to only their own inbox. Everyone else
 * sees the full, cross-inbox list (with an optional owner filter).
 */
export function ownerScopeForEmail(
  email: string | null | undefined,
): DealOwner | null {
  const e = (email || "").trim().toLowerCase();
  return EMAIL_TO_OWNER[e] ?? null;
}

/** Normalize a raw Sheet owner cell to a known tag (legacy blanks → "kb"). */
export function normalizeOwner(raw: string | null | undefined): DealOwner {
  const v = (raw || "").trim().toLowerCase();
  if (v === "aditya") return "aditya";
  if (v === "team" || v === "superdm") return "team";
  return "kb";
}

/** True if a deal belongs to the given owner scope (excludes SuperDM). */
export function dealMatchesOwner(deal: Deal, owner: DealOwner): boolean {
  if (normalizeOwner(deal.owner) !== owner) return false;
  // A locked inbox view never shows SuperDM pitches.
  return (deal.channel || "").trim().toLowerCase() !== "superdm";
}

/** Restrict a deals list to a session's owner scope, or return it unchanged. */
export function scopeDealsForEmail<T extends Deal>(
  deals: T[],
  email: string | null | undefined,
): T[] {
  const scope = ownerScopeForEmail(email);
  if (!scope) return deals;
  return deals.filter((d) => dealMatchesOwner(d, scope));
}
