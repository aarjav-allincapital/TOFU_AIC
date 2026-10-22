"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Deal, DealsPayload } from "./types";

type State = {
  deals: Deal[];
  fetchedAt: string | null;
  source: DealsPayload["source"] | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

const POLL_MS = 15_000;

export function useDeals(initial?: DealsPayload) {
  const [state, setState] = useState<State>({
    deals: initial?.deals ?? [],
    fetchedAt: initial?.fetchedAt ?? null,
    source: initial?.source ?? null,
    loading: !initial,
    refreshing: false,
    error: null,
  });

  const inFlight = useRef(false);

  const loadFromApi = useCallback(async () => {
    const res = await fetch("/api/deals", { cache: "no-store" });
    if (!res.ok) throw new Error(`Sync failed (${res.status})`);
    return (await res.json()) as DealsPayload;
  }, []);

  const load = useCallback(
    async (mode: "initial" | "poll" | "manual") => {
      if (inFlight.current) return;
      inFlight.current = true;
      setState((s) => ({
        ...s,
        refreshing: mode !== "initial",
        loading: mode === "initial" ? s.deals.length === 0 : s.loading,
      }));

      try {
        const payload = await loadFromApi();

        setState({
          deals: payload.deals,
          fetchedAt: payload.fetchedAt,
          source: payload.source,
          loading: false,
          refreshing: false,
          error: null,
        });
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          refreshing: false,
          error: err instanceof Error ? err.message : "Sync failed",
        }));
      } finally {
        inFlight.current = false;
      }
    },
    [loadFromApi],
  );

  useEffect(() => {
    if (!initial) load("initial");
    const id = setInterval(() => load("poll"), POLL_MS);
    const onFocus = () => load("poll");
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load("poll");
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(() => load("manual"), [load]);

  const patchDeal = useCallback((rowIndex: number, patch: Partial<Deal>) => {
    setState((s) => ({
      ...s,
      deals: s.deals.map((d) =>
        d.rowIndex === rowIndex ? { ...d, ...patch } : d,
      ),
    }));
  }, []);

  return { ...state, refresh, patchDeal };
}
