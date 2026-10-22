"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { relativeTime } from "@/lib/deal-utils";
import {
  BOARD_STAGE_LABELS,
  BOARD_STAGES,
  boardStageFor,
  type BoardStage,
} from "@/lib/sourcing/board";
import {
  EXAMPLE_MITRA_BLOCK,
  exampleSourcedFounder,
} from "@/lib/sourcing/parse";
import { sourcingSubtitle, sourcingTitle } from "@/lib/sourcing/display";
import type { SourcedFounder, SourcingStatus } from "@/lib/sourcing/types";
import { SOURCING_STATUSES } from "@/lib/sourcing/types";
import { LinkedInAvatar } from "./LinkedInPreviewCard";
import { CompassIcon, GridIcon, KanbanIcon, SearchIcon } from "./icons";
import { SourcingStatusBadge } from "./SourcingStatusBadge";
import { tracxnSummary } from "./TracxnPanel";

type StatusFilter = "All" | SourcingStatus;
type ViewMode = "grid" | "kanban";

const VIEW_KEY = "tofu-sourcing-view";
const viewListeners = new Set<() => void>();

function readView(): ViewMode {
  return localStorage.getItem(VIEW_KEY) === "kanban" ? "kanban" : "grid";
}

function writeView(mode: ViewMode) {
  localStorage.setItem(VIEW_KEY, mode);
  viewListeners.forEach((fn) => fn());
}

function subscribeView(fn: () => void) {
  viewListeners.add(fn);
  return () => viewListeners.delete(fn);
}

function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribeView, readView, () => "grid");
}
type AddedFilter = "newest" | "all" | "7d" | "30d";

const ADDED_ORDER: AddedFilter[] = ["newest", "all", "7d", "30d"];

const ADDED_LABELS: Record<AddedFilter, string> = {
  newest: "Newest",
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

function cardSummary(item: SourcedFounder): string {
  return item.domain || item.companyNote || item.pedigree || "";
}

function domainGroup(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "Unspecified";
  const first = t.split(/[;|]/)[0].trim();
  const label = (first.split(",")[0] || first).trim();
  return label.length > 42 ? `${label.slice(0, 42).trim()}…` : label;
}

function newestCutoff(rows: SourcedFounder[]): number {
  const maxRow = rows.reduce((m, r) => Math.max(m, r.rowIndex || 0), 0);
  return Math.max(0, maxRow - 20);
}

function passesAdded(
  item: SourcedFounder,
  added: AddedFilter,
  cutoffRow: number,
): boolean {
  if (added === "all") return true;
  const recentRow = item.rowIndex >= cutoffRow;
  if (added === "newest") return recentRow;
  const days = added === "7d" ? 7 : 30;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  if (item.addedAtMs && item.addedAtMs >= since) return true;
  return !item.addedAtMs && recentRow;
}

function sortNewest(a: SourcedFounder, b: SourcedFounder): number {
  if (b.rowIndex !== a.rowIndex) return b.rowIndex - a.rowIndex;
  return (b.addedAtMs ?? 0) - (a.addedAtMs ?? 0);
}

export function SourcingView({
  sourced,
  configured,
  error,
  onOpen,
  onConnectSheet,
  onMoveStage,
}: {
  sourced: SourcedFounder[];
  configured: boolean;
  error?: string;
  onOpen: (rowIndex: number) => void;
  onConnectSheet?: (raw: string) => boolean;
  onMoveStage?: (item: SourcedFounder, stage: BoardStage) => void;
}) {
  const view = useViewMode();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [added, setAdded] = useState<AddedFilter>("all");
  const [domain, setDomain] = useState("All");

  const counts = useMemo(() => {
    const next: Record<SourcingStatus, number> = {
      New: 0,
      Watching: 0,
      Outreach: 0,
      Passed: 0,
    };
    sourced.forEach((item) => {
      next[item.status] += 1;
    });
    return next;
  }, [sourced]);

  const domains = useMemo(() => {
    const countsByLabel = new Map<string, number>();
    sourced.forEach((item) => {
      const label = domainGroup(item.domain);
      countsByLabel.set(label, (countsByLabel.get(label) || 0) + 1);
    });
    const popular = [...countsByLabel.entries()]
      .filter(([label, n]) => label !== "Unspecified" && n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([label]) => label);
    const hasOther = [...countsByLabel.entries()].some(
      ([label, n]) => label === "Unspecified" || n < 2,
    );
    return { popular, hasOther };
  }, [sourced]);

  const cutoffRow = useMemo(() => newestCutoff(sourced), [sourced]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const popular = new Set(domains.popular);
    const rows = sourced.filter((item) => {
      if (status !== "All" && item.status !== status) return false;
      if (!passesAdded(item, added, cutoffRow)) return false;
      const group = domainGroup(item.domain);
      if (domain === "Other") {
        if (popular.has(group)) return false;
      } else if (domain !== "All" && group !== domain) {
        return false;
      }
      if (!q) return true;
      return [
        item.company,
        item.founder,
        item.companyNote,
        item.domain,
        item.stageTimeline,
        item.funding,
        item.pedigree,
        item.hardware,
        item.moat,
        item.tam,
        item.notes,
        item.linkedinPreview?.name,
        item.linkedinPreview?.headline,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    return [...rows].sort(sortNewest);
  }, [sourced, status, query, added, domain, cutoffRow, domains.popular]);

  const filtersOn =
    query.trim() !== "" ||
    status !== "All" ||
    added !== "all" ||
    domain !== "All";

  const metrics = [
    { label: "Sourced", value: sourced.length, hint: "Founders stored" },
    { label: "New", value: counts.New, hint: "Not triaged yet" },
    { label: "Watching", value: counts.Watching, hint: "Keep on radar" },
    { label: "Outreach", value: counts.Outreach, hint: "In conversation" },
  ];

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-2 divide-x divide-border lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="px-6 py-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                {m.label}
              </div>
              <div className="mt-1 text-[28px] font-bold tabular-nums leading-none tracking-tight">
                {m.value}
              </div>
              <div className="mt-1.5 text-[12px] text-muted">{m.hint}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1">
        {(["All", ...SOURCING_STATUSES] as StatusFilter[]).map((s) => {
          const active = status === s;
          const count = s === "All" ? sourced.length : counts[s];
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                active
                  ? "bg-sidebar-active text-foreground"
                  : "text-muted hover:bg-sidebar-active/70 hover:text-foreground"
              }`}
            >
              {s}
              <span className={`ml-1.5 ${active ? "opacity-60" : "opacity-45"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <section className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 md:min-w-[280px] md:flex-none md:basis-[360px]">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search founders, companies, domains…"
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-2 focus:border-border-strong focus:ring-2 focus:ring-gray-900/5"
          />
        </div>
        <select
          value={added}
          onChange={(e) => setAdded(e.target.value as AddedFilter)}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium outline-none transition-colors hover:bg-sidebar-active focus:border-border-strong"
        >
          {(ADDED_ORDER).map((k) => (
            <option key={k} value={k}>
              {ADDED_LABELS[k]}
            </option>
          ))}
        </select>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="max-w-[220px] rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium outline-none transition-colors hover:bg-sidebar-active focus:border-border-strong"
        >
          <option value="All">All domains</option>
          {domains.popular.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
          {domains.hasOther ? <option value="Other">Other</option> : null}
        </select>
        {filtersOn ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStatus("All");
              setAdded("all");
              setDomain("All");
            }}
            className="text-[12.5px] font-semibold text-muted hover:text-foreground"
          >
            Clear filters
          </button>
        ) : null}
        <div className="ml-auto flex items-center rounded-lg border border-border bg-surface p-0.5">
          {(
            [
              { mode: "grid", label: "Grid", Icon: GridIcon },
              { mode: "kanban", label: "Kanban", Icon: KanbanIcon },
            ] as const
          ).map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => writeView(mode)}
              aria-pressed={view === mode}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                view === mode
                  ? "bg-sidebar-active text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </section>

      {sourced.length > 0 ? (
        <p className="text-[12px] text-muted-2">
          {filtered.length === sourced.length
            ? `${filtered.length} founders · newest first`
            : `Showing ${filtered.length} of ${sourced.length} · newest first`}
        </p>
      ) : null}

      {error ? (
        <SignInHelp error={error} onConnectSheet={onConnectSheet} />
      ) : null}

      {!configured ? (
        <SetupEmpty />
      ) : filtered.length === 0 ? (
        <EmptyState hasRows={sourced.length > 0} />
      ) : view === "kanban" ? (
        <KanbanBoard
          items={filtered}
          onOpen={onOpen}
          onMoveStage={onMoveStage}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <li key={`${item.rowIndex}-${item.founder}-${item.company}`}>
              <SourcingCard item={item} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const COLUMN_ACCENT: Record<BoardStage, string> = {
  new: "bg-blue-500",
  reached_out: "bg-amber-500",
  talking: "bg-emerald-500",
};

const DRAG_TYPE = "application/x-tofu-sourcing-row";

function KanbanBoard({
  items,
  onOpen,
  onMoveStage,
}: {
  items: SourcedFounder[];
  onOpen: (rowIndex: number) => void;
  onMoveStage?: (item: SourcedFounder, stage: BoardStage) => void;
}) {
  const [dragOver, setDragOver] = useState<BoardStage | null>(null);
  const onBoard = items.filter((item) => item.status !== "Passed");
  const passed = items.length - onBoard.length;

  const columns = BOARD_STAGES.map((stage) => ({
    stage,
    rows: onBoard.filter((item) => boardStageFor(item) === stage),
  }));

  const drop = (stage: BoardStage, rowIndex: number) => {
    const item = onBoard.find((row) => row.rowIndex === rowIndex);
    if (item && boardStageFor(item) !== stage) onMoveStage?.(item, stage);
  };

  return (
    <div className="space-y-2">
      <div className="grid gap-3 md:grid-cols-3">
        {columns.map(({ stage, rows }) => (
          <section
            key={stage}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOver !== stage) setDragOver(stage);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setDragOver(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const row = Number(e.dataTransfer.getData(DRAG_TYPE));
              if (Number.isFinite(row)) drop(stage, row);
            }}
            className={`flex min-h-[320px] flex-col rounded-xl border bg-surface-muted/60 transition-colors ${
              dragOver === stage
                ? "border-border-strong bg-sidebar-active/60"
                : "border-border"
            }`}
          >
            <header className="flex items-center justify-between px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${COLUMN_ACCENT[stage]}`} />
                <h3 className="text-[13px] font-semibold">
                  {BOARD_STAGE_LABELS[stage]}
                </h3>
              </div>
              <span className="text-[12px] font-semibold tabular-nums text-muted-2">
                {rows.length}
              </span>
            </header>
            <ul className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5">
              {rows.length === 0 ? (
                <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border px-3 py-8 text-center text-[12px] text-muted-2">
                  Drag founders here
                </li>
              ) : (
                rows.map((item) => (
                  <li key={`${item.rowIndex}-${item.founder}-${item.company}`}>
                    <KanbanCard
                      item={item}
                      stage={stage}
                      onOpen={onOpen}
                      onMoveStage={onMoveStage}
                    />
                  </li>
                ))
              )}
            </ul>
          </section>
        ))}
      </div>
      {passed > 0 ? (
        <p className="text-[12px] text-muted-2">
          {passed} passed founder{passed === 1 ? "" : "s"} hidden from the board
        </p>
      ) : null}
    </div>
  );
}

function KanbanCard({
  item,
  stage,
  onOpen,
  onMoveStage,
}: {
  item: SourcedFounder;
  stage: BoardStage;
  onOpen: (rowIndex: number) => void;
  onMoveStage?: (item: SourcedFounder, stage: BoardStage) => void;
}) {
  const preview = item.linkedinPreview;
  const summary = cardSummary(item);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, String(item.rowIndex));
        e.dataTransfer.effectAllowed = "move";
      }}
      className="cursor-grab rounded-lg border border-border bg-surface p-3 shadow-sm transition-colors hover:border-border-strong active:cursor-grabbing"
    >
      <button
        type="button"
        onClick={() => onOpen(item.rowIndex)}
        className="flex w-full items-start gap-2.5 text-left"
      >
        <LinkedInAvatar
          src={preview?.avatar || ""}
          name={preview?.name || item.founder || item.company}
          size={34}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight">
            {sourcingTitle(item)}
          </div>
          <div className="mt-0.5 truncate text-[12px] leading-tight text-muted">
            {sourcingSubtitle(item)}
          </div>
          {summary ? (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-foreground/75">
              {summary}
            </p>
          ) : null}
        </div>
      </button>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-2">
          {item.addedAtMs ? relativeTime(item.addedAtMs) : ""}
        </span>
        {onMoveStage ? (
          <select
            value={stage}
            onChange={(e) => onMoveStage(item, e.target.value as BoardStage)}
            aria-label="Move to stage"
            className="rounded-md border border-border bg-surface px-1.5 py-1 text-[11.5px] font-medium text-muted outline-none hover:bg-sidebar-active focus:border-border-strong"
          >
            {BOARD_STAGES.map((s) => (
              <option key={s} value={s}>
                {BOARD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}

function SourcingCard({
  item,
  onOpen,
  example = false,
}: {
  item: SourcedFounder;
  onOpen?: (rowIndex: number) => void;
  example?: boolean;
}) {
  const summary = cardSummary(item);
  const preview = item.linkedinPreview;

  return (
    <button
      type="button"
      onClick={onOpen ? () => onOpen(item.rowIndex) : undefined}
      className="flex w-full flex-col rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-border-strong hover:bg-sidebar-active/40"
    >
      <div className="flex items-start gap-3">
        <LinkedInAvatar
          src={preview?.avatar || ""}
          name={preview?.name || item.founder || item.company}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold leading-tight">
                {sourcingTitle(item)}
              </div>
              <div className="mt-0.5 truncate text-[13px] leading-tight text-muted">
                {sourcingSubtitle(item)}
              </div>
            </div>
            <SourcingStatusBadge status={item.status} />
          </div>
          {summary ? (
            <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-foreground/80">
              {summary}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {item.addedAtMs ? (
          <span className="text-[11px] text-muted-2">
            {relativeTime(item.addedAtMs)}
          </span>
        ) : null}
        {item.tracxn && tracxnSummary(item.tracxn) ? (
          <span
            className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-neutral-700"
            title="From Tracxn"
          >
            {tracxnSummary(item.tracxn)}
          </span>
        ) : null}
        {example ? (
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
            Example card
          </span>
        ) : null}
      </div>
    </button>
  );
}

function SignInHelp({
  error,
  onConnectSheet,
}: {
  error: string;
  onConnectSheet?: (raw: string) => boolean;
}) {
  const [value, setValue] = useState("");
  const signIn =
    error.toLowerCase().includes("sign-in") ||
    error.toLowerCase().includes("unauthenticated access");
  const privateSheet = error.toLowerCase().includes("private");

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="text-[13px] font-semibold text-amber-950">
        {privateSheet
          ? "The sheet updated, but TOFU cannot read it"
          : signIn
            ? "The Web App is still behind Google sign-in"
            : "Could not load sourcing"}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-amber-900/80">
        {privateSheet
          ? "You can see new rows while signed into Google. The portal fetches without your login, so a private sheet looks empty or stuck."
          : signIn
            ? "TOFU’s server cannot read the Web App because Google asks for a login. Same lock as inbound Apps Script — the sheet fallback is what actually works."
            : error}
      </p>
      {privateSheet || signIn ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-amber-900/80">
          {privateSheet ? (
            <>
              <li>
                Open the sourcing spreadsheet → <span className="font-semibold">Share</span>.
              </li>
              <li>
                General access → <span className="font-semibold">Anyone with the link</span> →{" "}
                <span className="font-semibold">Viewer</span>.
              </li>
              <li>Back on Deal sourcing, click Refresh. New rows should appear as cards.</li>
            </>
          ) : (
            <>
              <li>
                Apps Script → Deploy → Manage deployments → Edit. Execute as{" "}
                <span className="font-semibold">Me</span>, Who has access{" "}
                <span className="font-semibold">Anyone</span> — not “Anyone with a
                Google account”.
              </li>
              <li>
                Open the /exec URL in an incognito window. You should see JSON, not
                a login page.
              </li>
              <li>
                If Workspace blocks that, share the sourcing spreadsheet Anyone with
                the link → Viewer and paste the link here.
              </li>
            </>
          )}
        </ol>
      ) : null}
      {onConnectSheet ? (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onConnectSheet(value);
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="min-w-[240px] flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px] outline-none placeholder:text-amber-900/40 focus:border-amber-400"
          />
          <button
            type="submit"
            className="rounded-lg bg-foreground px-3 py-2 text-[12px] font-semibold text-white"
          >
            Use this sheet
          </button>
        </form>
      ) : null}
    </div>
  );
}

function EmptyState({ hasRows }: { hasRows: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-muted text-muted-2">
        <CompassIcon className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-semibold">
        {hasRows ? "No sourced founders match your filters" : "No sourced founders yet"}
      </p>
      <p className="mt-1 max-w-md text-[13px] text-muted">
        {hasRows
          ? "Try Newest, All time, or clearing search."
          : "New sourced founders will appear here when the sheet updates."}
      </p>
    </div>
  );
}

function SetupEmpty() {
  const example = exampleSourcedFounder();
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-xl border border-border bg-surface px-6 py-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-muted text-muted-2">
          <CompassIcon className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-[16px] font-bold">Connect the sourcing sheet</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          This page is separate from inbound Founders. On the other Google
          account, paste <code className="text-[12px]">apps-script/sourcing/Code.gs</code>{" "}
          and run <span className="font-semibold text-foreground">setupSourcingWorkbook</span>.
          Then set <code className="text-[12px]">SOURCING_SHEET_ID</code> and{" "}
          <code className="text-[12px]">SOURCING_APPS_SCRIPT_URL</code> in{" "}
          <code className="text-[12px]">.env.local</code>.
        </p>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[13px] text-muted">
          <li>Create the workbook with the Apps Script (not the inbound sheet).</li>
          <li>Point your agent at the dump tab, or paste numbered dumps there.</li>
          <li>TOFU reads Sourced rows and renders these cards.</li>
        </ol>
        <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
          {EXAMPLE_MITRA_BLOCK}
        </pre>
      </div>
      <SourcingCard item={example} example />
    </div>
  );
}
