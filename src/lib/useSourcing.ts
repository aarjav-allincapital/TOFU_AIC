"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSourcingFromAppsScriptClient,
  sourcingAppsScriptClientUrl,
} from "./sourcing/client";
import { sourcingBoardKey, type BoardStage } from "./sourcing/board";
import { withoutHiddenSourcing } from "./sourcing/hidden";
import { parseSourcingSheetId } from "./sourcing/sheet-id";
import type { SourcedFounder, SourcingPayload } from "./sourcing/types";

type State = SourcingPayload & {
  loading: boolean;
  refreshing: boolean;
};

const POLL_MS = 30_000;
const SHEET_KEY = "tofu-sourcing-sheet-id";

const EMPTY: SourcingPayload = {
  sourced: [],
  count: 0,
  fetchedAt: "",
  configured: false,
  source: "unconfigured",
};

function isSignInError(message: string | undefined): boolean {
  const t = (message || "").toLowerCase();
  return t.includes("sign-in") || t.includes("unauthenticated access");
}

export function useSourcing() {
  const [state, setState] = useState<State>({
    ...EMPTY,
    loading: true,
    refreshing: false,
  });
  const inFlight = useRef(false);
  const queued = useRef(false);
  // Moves not yet confirmed by the server; a poll must not snap cards back.
  const pendingStages = useRef(new Map<string, BoardStage>());

  const applyPending = useCallback((rows: SourcedFounder[]) => {
    if (pendingStages.current.size === 0) return rows;
    return rows.map((item) => {
      const key = sourcingBoardKey(item);
      const stage = pendingStages.current.get(key);
      if (!stage) return item;
      if (item.boardStage === stage) {
        pendingStages.current.delete(key);
        return item;
      }
      return { ...item, boardStage: stage };
    });
  }, []);

  const load = useCallback(async (mode: "initial" | "poll" | "manual") => {
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    inFlight.current = true;
    setState((s) => ({
      ...s,
      refreshing: mode !== "initial",
      loading: mode === "initial" ? s.sourced.length === 0 : s.loading,
    }));
    try {
      const sheetId =
        typeof window !== "undefined"
          ? parseSourcingSheetId(localStorage.getItem(SHEET_KEY))
          : null;
      const url = sheetId
        ? `/api/sourcing?sheetId=${encodeURIComponent(sheetId)}`
        : "/api/sourcing";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Sourcing fetch failed (${res.status})`);
      let payload = (await res.json()) as SourcingPayload;

      if (
        isSignInError(payload.error) &&
        sourcingAppsScriptClientUrl() &&
        (!payload.sourced || payload.sourced.length === 0)
      ) {
        try {
          payload = await fetchSourcingFromAppsScriptClient();
        } catch {
          // Keep the server error — browser Google session did not help.
        }
      }

      const sourced = withoutHiddenSourcing(
        Array.isArray(payload.sourced) ? payload.sourced : [],
      )
        .sort((a, b) => {
          if (b.rowIndex !== a.rowIndex) return b.rowIndex - a.rowIndex;
          return (b.addedAtMs ?? 0) - (a.addedAtMs ?? 0);
        });
      setState({
        ...payload,
        sourced: applyPending(sourced),
        count: payload.count ?? sourced.length,
        loading: false,
        refreshing: false,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        refreshing: false,
        error: err instanceof Error ? err.message : "Sourcing fetch failed",
      }));
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        void load("poll");
      }
    }
  }, [applyPending]);

  const setBoardStage = useCallback(
    async (item: SourcedFounder, stage: BoardStage) => {
      const key = sourcingBoardKey(item);
      pendingStages.current.set(key, stage);
      setState((s) => ({ ...s, sourced: applyPending(s.sourced) }));
      try {
        const res = await fetch("/api/sourcing/stage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, stage }),
        });
        if (!res.ok) throw new Error(`Stage save failed (${res.status})`);
      } catch (err) {
        pendingStages.current.delete(key);
        setState((s) => ({
          ...s,
          sourced: s.sourced.map((row) =>
            sourcingBoardKey(row) === key
              ? { ...row, boardStage: item.boardStage ?? null }
              : row,
          ),
          error: err instanceof Error ? err.message : "Stage save failed",
        }));
      }
    },
    [applyPending],
  );

  const connectSheet = useCallback(
    (raw: string) => {
      const id = parseSourcingSheetId(raw);
      if (!id) {
        setState((s) => ({
          ...s,
          error:
            "That does not look like a Google Sheet URL or ID. Paste the link from the sourcing workbook.",
        }));
        return false;
      }
      localStorage.setItem(SHEET_KEY, id);
      void load("manual");
      return true;
    },
    [load],
  );

  useEffect(() => {
    load("initial");
    const onFocus = () => load("poll");
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load("poll");
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const id = setInterval(() => load("poll"), POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(id);
    };
  }, [load]);

  return {
    ...state,
    refresh: () => load("manual"),
    connectSheet,
    setBoardStage,
  };
}
