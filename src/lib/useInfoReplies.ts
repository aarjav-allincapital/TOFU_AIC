"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Deal } from "./types";

const STORAGE_KEY = "dealflow-info-reply-dismissed";

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

function replyKey(deal: Deal): string {
  return `${deal.rowIndex}:${deal.infoRepliedAt || ""}`;
}

export function parseInfoReplyNote(note?: string | null): {
  subject: string;
  body: string;
} {
  const raw = String(note || "").trim();
  if (!raw) return { subject: "", body: "" };
  const m = raw.match(/^Subject:\s*(.*)\n?([\s\S]*)$/i);
  if (m) return { subject: m[1].trim(), body: (m[2] || "").trim() };
  return { subject: "", body: raw };
}

/**
 * A reply is only ever recorded while the deal sits in Request Info, so the
 * stamp alone is the signal. Don't re-check the bucket here — moving the deal
 * on to a call afterwards must not make the reply vanish from the UI.
 */
export function isInfoReplyDeal(deal: Deal): boolean {
  return Boolean(deal.infoRepliedAt);
}

function repliedMs(deal: Deal): number {
  const t = Date.parse(deal.infoRepliedAt || "");
  return Number.isFinite(t) ? t : 0;
}

/**
 * Request Info follow-ups.
 *  - `visibleReplies`: NEW replies — one expanded card until the deal is clicked.
 *  - `allReplies`: every reply (seen + new) for the dropdown next to that card.
 *  The tray unmounts once every new reply has been opened.
 */
export function useInfoReplies(deals: Deal[]) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Until we've read the dismissed list from localStorage we render NOTHING —
  // otherwise the tray flashes every reply in and then rips the already-seen
  // ones back out, which looks like a glitch. Server + first client render both
  // produce an empty tray, so hydration stays clean.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setDismissed(loadDismissed());
    setHydrated(true);
  }, []);

  const allReplies = useMemo(
    () =>
      hydrated
        ? deals
            .filter(isInfoReplyDeal)
            .sort((a, b) => repliedMs(b) - repliedMs(a))
        : [],
    [deals, hydrated],
  );

  const visibleReplies = useMemo(
    () => allReplies.filter((d) => !dismissed.has(replyKey(d))),
    [allReplies, dismissed],
  );

  const isReplySeen = useCallback(
    (deal: Deal) => dismissed.has(replyKey(deal)),
    [dismissed],
  );

  const dismissReply = useCallback((deal: Deal) => {
    if (!isInfoReplyDeal(deal)) return;
    const key = replyKey(deal);
    setDismissed((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      saveDismissed(next);
      return next;
    });
  }, []);

  return { allReplies, visibleReplies, isReplySeen, dismissReply };
}
