/** Client-safe Worth? badge helpers (no server / OpenAI imports). */

export type WorthBadge = "Yes" | "Review" | "No";

export function starsToWorthBadge(stars: number): WorthBadge {
  if (stars >= 4) return "Yes";
  if (stars === 3) return "Review";
  return "No";
}

/** Resolve display worth from AI rating or free-text sheet worth. */
export function resolveWorthBadge(
  aiWorth: string | null | undefined,
  sheetWorth: string | null | undefined,
  aiStars: number | null | undefined,
): WorthBadge | null {
  if (aiStars != null) return starsToWorthBadge(aiStars);
  const raw = (aiWorth || sheetWorth || "").trim().toLowerCase();
  if (!raw) return null;
  if (
    raw === "yes" ||
    /worth a call|partner call/.test(raw) ||
    /^(worth|partner|pursue|strong)/.test(raw)
  ) {
    return "Yes";
  }
  if (raw === "review" || /review|deck|desk|borderline|maybe|check/.test(raw)) {
    return "Review";
  }
  if (raw === "no" || /^(no|pass|likely)/.test(raw) || /\bpass\b/.test(raw)) {
    return "No";
  }
  return null;
}
