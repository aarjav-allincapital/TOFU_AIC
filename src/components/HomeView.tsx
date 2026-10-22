"use client";

import { useMemo } from "react";
import type { Deal } from "@/lib/types";
import {
  initials,
  isDealHighlighted,
  relativeTime,
  STAGE_ORDER,
  STAGE_STYLES,
} from "@/lib/deal-utils";
import {
  recentActivity,
  stageDistribution,
  topSectors,
  weeklyInbound,
  worthACall,
} from "@/lib/analytics";
import { StageBadge } from "./StageBadge";
import { MailIcon, PhoneIcon } from "./icons";
import type { StageView } from "./Sidebar";

export function HomeView({
  deals,
  onOpen,
  onNavigate,
  isUnread,
  isPinnedDismissed,
}: {
  deals: Deal[];
  onOpen: (row: number) => void;
  onNavigate: (stage: StageView) => void;
  isUnread: (row: number) => boolean;
  isPinnedDismissed: (deal: Deal) => boolean;
}) {
  const stages = useMemo(() => stageDistribution(deals), [deals]);
  const worth = useMemo(() => worthACall(deals, 6), [deals]);
  const activity = useMemo(() => recentActivity(deals, 8), [deals]);
  const trend = useMemo(() => weeklyInbound(deals, 8), [deals]);
  const sectors = useMemo(() => topSectors(deals, 6), [deals]);

  const trendMax = Math.max(1, ...trend.map((t) => t.count));
  const newWeek = trend[trend.length - 1]?.count ?? 0;

  const stageTotal = Math.max(
    1,
    STAGE_ORDER.reduce((sum, s) => sum + stages[s], 0),
  );
  const sectorMax = Math.max(1, ...sectors.map((s) => s.count));

  const metrics = [
    {
      label: "Total inbound",
      value: deals.length,
      hint: "All founder emails received",
    },
    {
      label: "New (7 days)",
      value: newWeek,
      hint: "Inbound this week",
    },
    {
      label: "In review",
      value: stages["In Review"],
      hint: "Active evaluation",
    },
    {
      label: "Worth a call",
      value: worth.length,
      hint: "High-signal deals",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Unified metrics strip — reference style */}
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

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* Worth a call */}
        <Panel
          title="Deals worth a call"
          subtitle="Rated, flagged, or in meeting stage"
          action={
            <button
              onClick={() => onNavigate("Meeting")}
              className="text-[12px] font-semibold text-muted hover:text-foreground"
            >
              View pipeline →
            </button>
          }
        >
          {worth.length === 0 ? (
            <Empty text="No high-signal deals right now." />
          ) : (
            <ul className="divide-y divide-border">
              {worth.map(({ deal, stage, reasons, score }) => (
                <li key={deal.rowIndex}>
                  <button
                    onClick={() => onOpen(deal.rowIndex)}
                    className="flex w-full items-center gap-3 py-3.5 text-left transition-colors hover:bg-sidebar-active/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-[12px] font-bold">
                      {initials(deal.company, deal.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold">
                          {deal.company || "Untitled"}
                        </span>
                        <StageBadge stage={stage} />
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        {reasons.slice(0, 2).join(" · ")}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
                      {score.toFixed(1)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Inbound volume" subtitle="Weekly founder emails">
            <div className="flex items-end justify-between gap-2 pt-1">
              {trend.map((t, i) => (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <span className="text-[11px] font-semibold tabular-nums text-muted">
                    {t.count}
                  </span>
                  <div className="flex h-20 w-full items-end">
                    <div
                      className="w-full rounded-t-sm bg-foreground/75"
                      style={{
                        height: `${Math.max(4, (t.count / trendMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-2">
                    {t.label}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Pipeline" subtitle="Stage distribution">
            <div className="space-y-3 pt-1">
              {STAGE_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => onNavigate(s)}
                  className="flex w-full items-center gap-3"
                >
                  <span className="w-[72px] shrink-0 text-left text-[12px] font-medium text-muted">
                    {s}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={`h-full rounded-full ${STAGE_STYLES[s].dot}`}
                      style={{ width: `${(stages[s] / stageTotal) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[12px] font-semibold tabular-nums">
                    {stages[s]}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* Recent activity — timeline style */}
        <Panel
          title="Recent activity"
          subtitle="Inbound emails and pipeline actions"
        >
          {activity.length === 0 ? (
            <Empty text="No activity yet." />
          ) : (
            <ul>
              {activity.map((item, i) => {
                const highlighted = isDealHighlighted(
                  item.deal,
                  isUnread(item.deal.rowIndex),
                  isPinnedDismissed(item.deal),
                );
                return (
                <li key={i} className="relative flex gap-4 pb-0">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-muted ${
                        highlighted
                          ? "border-sky-300 bg-sky-100 text-sky-700"
                          : "border-border bg-surface-muted"
                      }`}
                    >
                      {item.kind === "inbound" ? (
                        <MailIcon className="h-4 w-4" />
                      ) : (
                        <PhoneIcon className="h-4 w-4" />
                      )}
                    </div>
                    {i < activity.length - 1 && (
                      <div className="my-1 w-px flex-1 min-h-[20px] bg-border" />
                    )}
                  </div>
                  <button
                    onClick={() => onOpen(item.deal.rowIndex)}
                    className={`mb-5 flex-1 rounded-lg pb-1 pl-2 pr-2 text-left transition-colors hover:opacity-80 ${
                      highlighted ? "bg-sky-100/80" : ""
                    }`}
                  >
                    <div className="text-[14px] font-semibold text-foreground">
                      {item.deal.company || item.deal.name || "Untitled"}
                      <span className="font-normal text-muted">
                        {" "}
                        {item.kind === "inbound" ? "received" : item.label}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted">
                      {item.deal.sector || "—"}
                      <span className="text-muted-2"> · </span>
                      <span suppressHydrationWarning>
                        {relativeTime(item.ts)}
                      </span>
                    </div>
                  </button>
                </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Top sectors" subtitle="Inbound by category">
          {sectors.length === 0 ? (
            <Empty text="No sectors yet." />
          ) : (
            <div className="space-y-3 pt-1">
              {sectors.map((s) => (
                <div key={s.sector} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-[12px] font-medium text-muted">
                    {s.sector}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-foreground/70"
                      style={{ width: `${(s.count / sectorMax) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[12px] font-semibold tabular-nums">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="py-8 text-center text-[13px] text-muted-2">{text}</p>
  );
}
