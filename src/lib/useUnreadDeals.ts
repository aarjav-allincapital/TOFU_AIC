"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Deal } from "./types";

const STORAGE_KEY = "dealflow-unread-rows";

function loadUnread(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as number[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function saveUnread(rows: Set<number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...rows]));
}

/**
 * Tracks inbound deals that arrived after the session baseline.
 * Persists unread row indices until the user opens the deal.
 */
export function useUnreadDeals(deals: Deal[]) {
  const [unreadRows, setUnreadRows] = useState<Set<number>>(new Set());
  const snapshotRef = useRef<Set<number> | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    setUnreadRows(loadUnread());
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current || deals.length === 0) return;

    const currentRows = new Set(deals.map((d) => d.rowIndex));

    if (snapshotRef.current === null) {
      snapshotRef.current = currentRows;
      return;
    }

    const newlyArrived: number[] = [];
    for (const row of currentRows) {
      if (!snapshotRef.current.has(row)) {
        newlyArrived.push(row);
      }
    }
    snapshotRef.current = currentRows;

    if (newlyArrived.length === 0) return;

    setUnreadRows((prev) => {
      const next = new Set(prev);
      newlyArrived.forEach((r) => next.add(r));
      saveUnread(next);
      return next;
    });
  }, [deals]);

  const markRead = useCallback((rowIndex: number) => {
    setUnreadRows((prev) => {
      if (!prev.has(rowIndex)) return prev;
      const next = new Set(prev);
      next.delete(rowIndex);
      saveUnread(next);
      return next;
    });
  }, []);

  const isUnread = useCallback(
    (rowIndex: number) => unreadRows.has(rowIndex),
    [unreadRows],
  );

  return { unreadCount: unreadRows.size, isUnread, markRead };
}
