"use client";

import { useCallback, useEffect, useState } from "react";
import type { Deal } from "./types";
import { isPinnedHighlight } from "./deal-utils";

const STORAGE_KEY = "dealflow-pinned-dismissed";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDismissed(keys: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
}

/** One-off pinned highlights (e.g. Musubi) — cleared when the deal is opened. */
export function usePinnedHighlight() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  const pinnedKey = (deal: Deal) => deal.company?.trim().toLowerCase() ?? "";

  const isPinnedDismissed = useCallback(
    (deal: Deal) => dismissed.has(pinnedKey(deal)),
    [dismissed],
  );

  const dismissPinned = useCallback((deal: Deal) => {
    if (!isPinnedHighlight(deal)) return;
    const key = pinnedKey(deal);
    setDismissed((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      saveDismissed(next);
      return next;
    });
  }, []);

  return { isPinnedDismissed, dismissPinned };
}
