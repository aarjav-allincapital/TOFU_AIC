"use client";

import { resolveWorthBadge, type WorthBadge } from "@/lib/rating/display";
import type { Deal } from "@/lib/types";

const STYLES: Record<WorthBadge, string> = {
  Yes: "border-emerald-200 bg-emerald-100 text-emerald-800",
  Review: "border-amber-200 bg-amber-100 text-amber-900",
  No: "border-red-200 bg-red-100 text-red-800",
};

export function WorthBadgePill({
  deal,
  worth,
  stars,
  sheetWorth,
  className = "",
}: {
  deal?: Deal;
  worth?: string | null;
  stars?: number | null;
  sheetWorth?: string | null;
  className?: string;
}) {
  const badge = resolveWorthBadge(
    worth ?? deal?.aiWorth,
    sheetWorth ?? deal?.worth,
    stars ?? deal?.aiRatingStars,
  );
  if (!badge) {
    return (
      <span
        className={`inline-flex items-center rounded-md border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted-2 ${className}`}
      >
        Unrated
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STYLES[badge]} ${className}`}
    >
      {badge}
    </span>
  );
}

export function StarRating({
  stars,
  className = "",
}: {
  stars: number | null | undefined;
  className?: string;
}) {
  if (stars == null) {
    return <span className={`text-[13px] text-muted-2 ${className}`}>—</span>;
  }
  if (stars <= 0) {
    return <span className={`text-[13px] text-muted-2 ${className}`}>—</span>;
  }
  return (
    <span className={`text-[13px] tracking-tight ${className}`} title={`${stars}/5`}>
      {"⭐".repeat(stars)}
    </span>
  );
}

/** Compact AI or Jev cell: label + worth pill + stars. */
export function RatingColumn({
  label,
  stars,
  worth,
  sheetWorth,
  pending = false,
}: {
  label: string;
  stars: number | null | undefined;
  worth?: string | null;
  sheetWorth?: string | null;
  pending?: boolean;
}) {
  return (
    <div
      className={`min-w-0 ${pending ? "rounded-md bg-violet-50 ring-1 ring-violet-200" : ""}`}
    >
      <div className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-muted-2">
        {label}
        {pending ? " · rating…" : ""}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <WorthBadgePill
          worth={worth}
          stars={stars ?? null}
          sheetWorth={sheetWorth}
        />
        <StarRating stars={stars} />
      </div>
    </div>
  );
}
