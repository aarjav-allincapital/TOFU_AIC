"use client";

import { useEffect, useMemo, useState } from "react";
import type { Deal } from "@/lib/types";
import {
  classifyStage,
  initials,
  isDealHighlighted,
  STAGE_ORDER,
  type Stage,
} from "@/lib/deal-utils";
import {
  DATE_FILTER_LABELS,
  passesDateFilter,
  type DateFilter,
} from "@/lib/date-filter";
import { StageBadge } from "./StageBadge";
import { RatingColumn } from "./WorthBadge";
import { InboxIcon, MailIcon, SearchIcon } from "./icons";
import type { StageView } from "./Sidebar";
import { isInfoReplyDeal, parseInfoReplyNote } from "@/lib/useInfoReplies";
import { isLocalLab } from "@/lib/local-lab";

const GRID_WITH_JEV =
  "grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1fr)_minmax(0,1fr)_220px]";
const GRID_NO_JEV =
  "grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,1fr)_220px]";

export function InboundsView({
  deals,
  stage,
  onStageChange,
  stageCounts,
  isUnread,
  isPinnedDismissed,
  onOpen,
  onDealUpdated,
  replyDeals = [],
  jevActiveRow = null,
}: {
  deals: Deal[];
  stage: StageView;
  onStageChange: (s: StageView) => void;
  stageCounts: Record<Stage, number>;
  isUnread: (row: number) => boolean;
  isPinnedDismissed: (deal: Deal) => boolean;
  onOpen: (row: number) => void;
  onDealUpdated?: (rowIndex: number, patch: Partial<Deal>) => void;
  replyDeals?: Deal[];
  jevActiveRow?: number | null;
}) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("All");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [visible, setVisible] = useState(60);

  const withStage = useMemo(
    () => deals.map((d) => ({ deal: d, stage: classifyStage(d) })),
    [deals],
  );

  const sectors = useMemo(() => {
    const set = new Set<string>();
    deals.forEach((d) => d.sector && set.add(d.sector));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [deals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withStage.filter(({ deal, stage: s }) => {
      if (stage !== "All" && s !== stage) return false;
      if (sector !== "All" && deal.sector !== sector) return false;
      if (!passesDateFilter(deal, dateFilter)) return false;
      if (!q) return true;
      return [
        deal.company,
        deal.name,
        deal.sector,
        deal.blurb,
        deal.summary,
        deal.senderEmail,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [withStage, stage, sector, dateFilter, query]);

  const replyRows = useMemo(
    () => new Set(replyDeals.map((d) => d.rowIndex)),
    [replyDeals],
  );

  const ordered = useMemo(() => {
    const pinned = filtered.filter(({ deal }) => replyRows.has(deal.rowIndex));
    const rest = filtered.filter(({ deal }) => !replyRows.has(deal.rowIndex));
    return [...pinned, ...rest];
  }, [filtered, replyRows]);

  useEffect(() => setVisible(60), [stage, sector, dateFilter, query]);

  const shown = ordered.slice(0, visible);
  const showJev = isLocalLab();
  const GRID = showJev ? GRID_WITH_JEV : GRID_NO_JEV;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1">
        {(["All", ...STAGE_ORDER] as StageView[]).map((s) => {
          const active = stage === s;
          const count =
            s === "All" ? deals.length : stageCounts[s as Stage];
          return (
            <button
              key={s}
              onClick={() => onStageChange(s)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                active
                  ? "bg-sidebar-active text-foreground"
                  : "text-muted hover:bg-sidebar-active/70 hover:text-foreground"
              }`}
            >
              {s === "All" ? "All" : s}
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
            placeholder="Search companies, founders, sectors…"
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-2 focus:border-border-strong focus:ring-2 focus:ring-gray-900/5"
          />
        </div>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium outline-none transition-colors hover:bg-sidebar-active focus:border-border-strong"
        >
          {(Object.keys(DATE_FILTER_LABELS) as DateFilter[]).map((k) => (
            <option key={k} value={k}>
              {DATE_FILTER_LABELS[k]}
            </option>
          ))}
        </select>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium outline-none transition-colors hover:bg-sidebar-active focus:border-border-strong"
        >
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s === "All" ? "All sectors" : s}
            </option>
          ))}
        </select>
      </section>

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div
          className={`grid ${GRID} gap-4 border-b border-border bg-surface-muted/50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2`}
        >
          <span>Company</span>
          <span className="hidden md:block">Sector</span>
          <span className="hidden lg:block">Founder</span>
          <span className="hidden sm:block">AI rating</span>
          {showJev ? (
            <span className="hidden sm:block">Jev rating</span>
          ) : null}
          <span className="text-right">Stage</span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState hasDeals={deals.length > 0} />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map(({ deal, stage: s }) => (
              <DealListRow
                key={deal.rowIndex}
                deal={deal}
                stage={s}
                highlighted={isDealHighlighted(
                  deal,
                  isUnread(deal.rowIndex),
                  isPinnedDismissed(deal),
                )}
                isFreshReply={replyRows.has(deal.rowIndex)}
                jevPending={jevActiveRow === deal.rowIndex}
                showJev={showJev}
                gridClass={GRID}
                onOpen={onOpen}
                onDealUpdated={onDealUpdated}
              />
            ))}
          </ul>
        )}
      </section>

      {filtered.length > 0 && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {visible < ordered.length && (
            <button
              onClick={() => setVisible((v) => v + 60)}
              className="rounded-lg border border-border bg-surface px-5 py-2 text-[13px] font-semibold transition-colors hover:bg-sidebar-active"
            >
              Load more
            </button>
          )}
          <p className="text-center text-[12px] text-muted-2">
            Showing {shown.length} of {filtered.length} · {deals.length} total ·
            auto-syncs every 30s
          </p>
        </div>
      )}
    </div>
  );
}

function DealListRow({
  deal,
  stage,
  highlighted,
  isFreshReply,
  jevPending = false,
  showJev = false,
  gridClass,
  onOpen,
  onDealUpdated,
}: {
  deal: Deal;
  stage: Stage;
  highlighted: boolean;
  isFreshReply: boolean;
  jevPending?: boolean;
  showJev?: boolean;
  gridClass: string;
  onOpen: (row: number) => void;
  onDealUpdated?: (rowIndex: number, patch: Partial<Deal>) => void;
}) {
  const hasReply = isInfoReplyDeal(deal);
  const [mailOpen, setMailOpen] = useState(isFreshReply);
  const reply = hasReply ? parseInfoReplyNote(deal.infoReplyNote) : null;
  const emphasize = highlighted || isFreshReply;

  return (
    <li>
      <div
        className={`grid w-full ${gridClass} items-center gap-4 px-5 py-3.5 ${
          emphasize
            ? "border-l-2 border-l-sky-500 bg-sky-100/80"
            : "border-l-2 border-l-transparent"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          {hasReply ? (
            <button
              type="button"
              aria-label={mailOpen ? "Hide replied mail" : "Show replied mail"}
              aria-expanded={mailOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMailOpen((v) => !v);
              }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sky-900 transition-colors hover:bg-sky-200/80"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${mailOpen ? "rotate-90" : ""}`}
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ) : (
            <span className="hidden w-7 shrink-0 sm:block" />
          )}
          <button
            type="button"
            onClick={() => onOpen(deal.rowIndex)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-[12px] font-bold ${
                emphasize
                  ? "border-sky-300 bg-sky-100 text-sky-900"
                  : "border-border bg-surface-muted"
              }`}
            >
              {initials(deal.company, deal.name)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">
                  {deal.company || "Untitled"}
                </span>
                {hasReply ? (
                  <span className="shrink-0 rounded-md bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
                    Replied
                  </span>
                ) : /^have met$/i.test(deal.action.trim()) ||
                  Boolean(deal.manualBucketBy?.includes("|have-met")) ? (
                  <span className="shrink-0 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                    Have met
                  </span>
                ) : highlighted ? (
                  <span className="shrink-0 rounded-md bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
                    New
                  </span>
                ) : null}
              </div>
              <div className="truncate text-[12px] text-muted">
                {deal.blurb || deal.senderEmail || "—"}
              </div>
            </div>
          </button>
        </div>
        <button
          type="button"
          onClick={() => onOpen(deal.rowIndex)}
          className="hidden min-w-0 text-left md:block"
        >
          <span className="truncate text-[13px] text-muted">
            {deal.sector || "—"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onOpen(deal.rowIndex)}
          className="hidden min-w-0 text-left lg:block"
        >
          <span className="truncate text-[13px] text-muted">
            {deal.name || "—"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onOpen(deal.rowIndex)}
          className="hidden min-w-0 text-left sm:block"
        >
          <RatingColumn
            label="AI"
            stars={deal.aiRatingStars}
            worth={deal.aiWorth}
            sheetWorth={deal.worth}
          />
        </button>
        {showJev ? (
        <button
          type="button"
          onClick={() => onOpen(deal.rowIndex)}
          className="hidden min-w-0 text-left sm:block"
        >
          <RatingColumn
            label="Jev"
            stars={deal.jevRatingStars}
            worth={deal.jevWorth}
            pending={jevPending}
          />
        </button>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          {stage === "Meeting" ? (
            <MeetingPassControl deal={deal} onDealUpdated={onDealUpdated} />
          ) : null}
          <button
            type="button"
            onClick={() => onOpen(deal.rowIndex)}
            className="flex justify-end"
          >
            <StageBadge stage={stage} />
          </button>
        </div>
      </div>
      {hasReply && mailOpen && reply && (
        <button
          type="button"
          onClick={() => onOpen(deal.rowIndex)}
          className="flex w-full items-start gap-3 border-t border-sky-100 bg-sky-50/70 px-5 py-2.5 pl-[4.5rem] text-left hover:bg-sky-50 sm:pl-16"
        >
          <MailIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-800" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-sky-800">
              Replied mail
            </div>
            <div className="truncate text-[12.5px] font-semibold text-foreground">
              {reply.subject || "Follow-up from founder"}
            </div>
            <div className="truncate text-[12px] text-muted">
              {(reply.body || "They sent a follow-up.")
                .replace(/\s+/g, " ")
                .slice(0, 140)}
            </div>
          </div>
        </button>
      )}
    </li>
  );
}

function MeetingPassControl({
  deal,
  onDealUpdated,
}: {
  deal: Deal;
  onDealUpdated?: (rowIndex: number, patch: Partial<Deal>) => void;
}) {
  const [state, setState] = useState<
    "idle" | "confirm" | "saving" | "error"
  >("idle");

  const move = async () => {
    setState("saving");
    try {
      const res = await fetch("/api/deals/bucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: deal.rowIndex,
          bucket: "pass_temporary",
          founderEmail: deal.senderEmail,
          founderName: deal.name,
          haveMet: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        return;
      }
      onDealUpdated?.(deal.rowIndex, {
        manualBucket: "pass_temporary",
        manualBucketAt: new Date().toISOString(),
        manualBucketBy: "ui|have-met",
        status: data.status || "Pass",
        action: data.action || "Have met",
        actionDate: data.actionDate || new Date().toISOString().slice(0, 10),
      });
    } catch {
      setState("error");
    }
  };

  if (state === "confirm") {
    return (
      <div className="flex items-center gap-1 text-[11px] font-semibold text-muted">
        <span>Move to pass?</span>
        <button
          type="button"
          onClick={() => void move()}
          aria-label="Yes, move to pass"
          title="Yes"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => setState("idle")}
          aria-label="No, keep in meeting"
          title="No"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setState("confirm")}
      disabled={state === "saving"}
      title={state === "error" ? "Could not move. Try again." : undefined}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
        state === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100/70"
      } disabled:opacity-50`}
    >
      {state === "saving"
        ? "Moving…"
        : state === "error"
          ? "Try again"
          : "Move to Pass"}
    </button>
  );
}

function EmptyState({ hasDeals }: { hasDeals: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-muted text-muted-2">
        <InboxIcon className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-semibold">
        {hasDeals ? "No deals match your filters" : "No inbound deals yet"}
      </p>
      <p className="mt-1 text-[13px] text-muted">
        {hasDeals
          ? "Try clearing search or switching pipeline stage."
          : "New founder emails will appear here as the sheet updates."}
      </p>
    </div>
  );
}
