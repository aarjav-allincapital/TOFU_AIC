"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DealsPayload } from "@/lib/types";
import { useDeals } from "@/lib/useDeals";
import { usePinnedHighlight } from "@/lib/usePinnedHighlight";
import { useUnreadDeals } from "@/lib/useUnreadDeals";
import { useInfoReplies } from "@/lib/useInfoReplies";
import { classifyStage, relativeTime, type Stage } from "@/lib/deal-utils";
import {
  normalizeOwner,
  OWNER_LABELS,
  type DealOwner,
} from "@/lib/deal-owner";
import {
  Sidebar,
  type NavTarget,
  type Page,
  type StageView,
} from "./Sidebar";
import { HomeView } from "./HomeView";
import { InboundsView } from "./InboundsView";
import { TeamView } from "./TeamView";
import { SourcingView } from "./SourcingView";
import { DealModal } from "./DealModal";
import { SourcingModal } from "./SourcingModal";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { InviteTeamModal } from "./InviteTeamModal";
import { OnboardingModal } from "./OnboardingModal";
import { ProfileSettingsModal } from "./ProfileSettingsModal";
import { InfoReplyTray } from "./InfoReplyTray";
import { RefreshIcon } from "./icons";
import { useSourcing } from "@/lib/useSourcing";
import { isLocalLab } from "@/lib/local-lab";

const COLLAPSE_KEY = "dealflow-sidebar-collapsed";

function OwnerSwitcher({
  options,
  value,
  onChange,
}: {
  options: readonly (DealOwner | "all")[];
  value: DealOwner | "all";
  onChange: (v: DealOwner | "all") => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const btn = btnRefs.current.get(value);
    const container = containerRef.current;
    if (!btn || !container) return;
    const cr = container.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setPill({ left: br.left - cr.left, width: br.width });
    if (!ready) setReady(true);
  }, [value, ready]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }, [measure]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center rounded-xl border border-border-strong bg-surface p-1 text-[13px] font-bold shadow-sm"
    >
      <div
        className="absolute top-1 bottom-1 rounded-lg bg-foreground shadow-md"
        style={{
          left: pill.left,
          width: pill.width,
          transition: ready ? "left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1)" : "none",
        }}
      />
      {options.map((key) => (
        <button
          key={key}
          ref={(el) => { if (el) btnRefs.current.set(key, el); }}
          onClick={() => onChange(key)}
          className={`relative z-10 rounded-lg px-4 py-1.5 transition-colors duration-200 ${
            value === key ? "text-white" : "text-muted-2 hover:text-foreground"
          }`}
        >
          {key === "all" ? "All inboxes" : OWNER_LABELS[key]}
        </button>
      ))}
    </div>
  );
}

type MeState = {
  email: string | null;
  name: string | null;
  onboarded: boolean;
};

export function AppShell({ initial }: { initial?: DealsPayload }) {
  const router = useRouter();
  const { deals, fetchedAt, source, loading, refreshing, error, refresh, patchDeal } =
    useDeals(initial);
  const sourcing = useSourcing();
  const { isUnread, markRead, unreadCount } = useUnreadDeals(deals);
  const { isPinnedDismissed, dismissPinned } = usePinnedHighlight();

  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState<Page>("home");
  const [stage, setStage] = useState<StageView>("All");
  const [ownerFilter, setOwnerFilter] = useState<DealOwner | "all">("all");
  const [sidebarActiveKey, setSidebarActiveKey] = useState("home");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [selectedSourcingRow, setSelectedSourcingRow] = useState<number | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);
  const [me, setMe] = useState<MeState>({
    email: null,
    name: null,
    onboarded: true,
  });
  const [meLoaded, setMeLoaded] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [filterCalloutDismissed, setFilterCalloutDismissed] = useState(true);
  const localLab = isLocalLab();
  const [jevRun, setJevRun] = useState<{
    running: boolean;
    index: number;
    total: number;
    rowIndex: number | null;
    company: string;
    failed: number;
  }>({
    running: false,
    index: 0,
    total: 0,
    rowIndex: null,
    company: "",
    failed: 0,
  });
  const jevAbort = useRef(false);
  const jevBusy = useRef(false);

  useEffect(() => {
    setMounted(true);
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    if (!localStorage.getItem("filter-callout-seen")) {
      setFilterCalloutDismissed(false);
    }
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        setMe({
          email: data.email ?? null,
          name: data.name ?? null,
          onboarded: data.onboarded === true,
        });
      })
      .catch(() => {})
      .finally(() => setMeLoaded(true));
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const toggleCollapse = () =>
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });

  // Only the two human inboxes are selectable. SuperDM (team@) is never its own
  // chip — those deals surface under "All inboxes" only.
  const filterableOwners = useMemo(() => {
    const set = new Set<DealOwner>();
    deals.forEach((d) => {
      const o = normalizeOwner(d.owner);
      if (o !== "team") set.add(o);
    });
    return [...set];
  }, [deals]);

  const visibleDeals = useMemo(
    () =>
      ownerFilter === "all"
        ? deals
        : deals.filter((d) => normalizeOwner(d.owner) === ownerFilter),
    [deals, ownerFilter],
  );
  const { allReplies, visibleReplies, isReplySeen, dismissReply } =
    useInfoReplies(visibleDeals);

  const stageCounts = useMemo(() => {
    const counts: Record<Stage, number> = {
      New: 0,
      "In Review": 0,
      Meeting: 0,
      Passed: 0,
    };
    visibleDeals.forEach((d) => (counts[classifyStage(d)] += 1));
    return counts;
  }, [visibleDeals]);

  const selected =
    selectedRow != null
      ? deals.find((d) => d.rowIndex === selectedRow) ?? null
      : null;

  const selectedSourcing =
    selectedSourcingRow != null
      ? sourcing.sourced.find((item) => item.rowIndex === selectedSourcingRow) ??
        null
      : null;

  const openDeal = (row: number) => {
    const deal = deals.find((d) => d.rowIndex === row);
    if (deal) {
      dismissPinned(deal);
      // A new reply surfaces once — clicking the deal open marks it seen. It
      // stays reachable in the "All replies" dropdown afterwards.
      dismissReply(deal);
    }
    markRead(row);
    setSelectedRow(row);
  };

  const closeDeal = () => {
    setSelectedRow(null);
  };

  const openSourcing = (row: number) => setSelectedSourcingRow(row);
  const closeSourcing = () => setSelectedSourcingRow(null);

  const stopJev = () => {
    jevAbort.current = true;
  };

  const runJevAll = async () => {
    if (jevBusy.current) return;
    const list = visibleDeals.filter((d) => (d.company || "").trim());
    if (list.length === 0) return;
    jevBusy.current = true;
    jevAbort.current = false;
    setJevRun({
      running: true,
      index: 0,
      total: list.length,
      rowIndex: null,
      company: "",
      failed: 0,
    });
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      if (jevAbort.current) break;
      const deal = list[i];
      setJevRun({
        running: true,
        index: i,
        total: list.length,
        rowIndex: deal.rowIndex,
        company: deal.company,
        failed,
      });
      try {
        const res = await fetch("/api/jev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowIndex: deal.rowIndex,
            company: deal.company,
            name: deal.name,
            sector: deal.sector,
            blurb: deal.blurb,
            summary: deal.summary,
            website: deal.website,
            deckLink: deal.deckLink,
            senderEmail: deal.senderEmail,
            linkedin: deal.linkedin,
            eliteSchool: deal.eliteSchool,
            aiVia: deal.aiVia,
            aiWorth: deal.aiWorth,
            aiRatingStars: deal.aiRatingStars,
            aiSummary: deal.aiSummary,
            aiMode: deal.aiMode,
            worth: deal.worth,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          patch?: Partial<(typeof list)[number]>;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          failed += 1;
        } else if (data.patch) {
          patchDeal(deal.rowIndex, data.patch);
        }
      } catch {
        failed += 1;
      }
      setJevRun({
        running: true,
        index: i + 1,
        total: list.length,
        rowIndex: deal.rowIndex,
        company: deal.company,
        failed,
      });
    }
    setJevRun((s) => ({
      ...s,
      running: false,
      rowIndex: null,
      company: "",
    }));
    jevBusy.current = false;
  };

  const navigate = (target: NavTarget) => {
    setPage(target.page);
    if (target.page === "inbounds") {
      const s = target.stage ?? "All";
      setStage(s);
      setSidebarActiveKey(s === "All" ? "inbounds" : s);
    } else if (target.page === "team") {
      setSidebarActiveKey("team");
    } else if (target.page === "sourcing") {
      setSidebarActiveKey("sourcing");
    } else {
      setSidebarActiveKey("home");
    }
  };

  const goInbounds = (s: StageView) => {
    setPage("inbounds");
    setStage(s);
    setSidebarActiveKey(s === "All" ? "inbounds" : s);
  };

  const viewPage = page;

  const title =
    viewPage === "home"
      ? "Command Center"
      : viewPage === "team"
        ? "Team"
        : viewPage === "sourcing"
          ? "Deal sourcing"
          : stage === "All"
            ? "Inbounds"
            : stage;

  const subtitle =
    viewPage === "home"
      ? "Live inbound deal flow, pipeline and recent activity"
      : viewPage === "team"
        ? "Your All In Capital workspace — invite teammates and manage who has access"
        : viewPage === "sourcing"
          ? "Sourced founders, stored on a separate sheet from inbound"
          : "Founder emails ingested and evaluated from the system of record";

  const inboundChrome = viewPage !== "team" && viewPage !== "sourcing";
  const showSkeleton =
    viewPage === "sourcing"
      ? sourcing.loading && sourcing.sourced.length === 0 && sourcing.configured
      : viewPage !== "team" && loading;
  const headerRefreshing = viewPage === "sourcing" ? sourcing.refreshing : refreshing;
  const headerError =
    viewPage === "sourcing" ? Boolean(sourcing.error) && sourcing.sourced.length === 0 : error && deals.length === 0;
  const headerFetchedAt = viewPage === "sourcing" ? sourcing.fetchedAt : fetchedAt;
  const headerSource = viewPage === "sourcing" ? sourcing.source : source;

  const showOnboarding =
    meLoaded && !!me.email && !me.onboarded;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        activeKey={sidebarActiveKey}
        counts={stageCounts}
        total={visibleDeals.length}
        newCount={unreadCount}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        onNavigate={navigate}
        currentEmail={me.email}
        currentName={me.name}
        onInvite={() => setInviteOpen(true)}
        onProfile={() => setProfileOpen(true)}
        onLogout={logout}
        sourcingCount={sourcing.count}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="px-8 pb-16 pt-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[26px] font-bold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="mt-1 text-[14px] text-muted">{subtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              {filterableOwners.length > 1 && inboundChrome && (
                <div className="relative">
                  <OwnerSwitcher
                    options={["all" as const, ...filterableOwners]}
                    value={ownerFilter}
                    onChange={setOwnerFilter}
                  />
                  {!filterCalloutDismissed && (
                    <div
                      className="callout-fade-in absolute top-full right-0 z-50 mt-3"
                      onClick={() => {
                        setFilterCalloutDismissed(true);
                        localStorage.setItem("filter-callout-seen", "1");
                      }}
                    >
                      <div className="absolute -top-1.5 right-8 h-3 w-3 rotate-45 border-l border-t border-border-strong bg-surface" />
                      <div className="w-[260px] rounded-xl border border-border-strong bg-surface p-4 shadow-lg">
                        <p className="text-[13px] font-semibold text-foreground">
                          Filter by inbox
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-muted">
                          Switch between All inboxes, Aditya&apos;s deals, or KB&apos;s
                          deals. Your view is saved per session.
                        </p>
                        <button className="mt-3 rounded-lg bg-foreground px-3 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-80">
                          Got it
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {inboundChrome && unreadCount > 0 && (
                <span className="rounded-md bg-sky-100 px-2.5 py-1 text-[12px] font-semibold text-sky-800">
                  {unreadCount} new
                </span>
              )}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-muted">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    headerError ? "bg-red-500" : "bg-emerald-500 pulse-dot"
                  }`}
                />
                <span suppressHydrationWarning>
                  {headerError
                    ? "Sync error"
                    : !mounted
                      ? "Live"
                      : headerFetchedAt
                        ? `Synced ${relativeTime(new Date(headerFetchedAt).getTime())}${
                            headerSource === "apps-script" ? " · Apps Script" : ""
                          }`
                        : "Connecting…"}
                </span>
              </div>
              {localLab && inboundChrome && (
                <button
                  onClick={jevRun.running ? stopJev : runJevAll}
                  className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12px] font-semibold text-violet-900 transition-colors hover:bg-violet-100"
                  title={
                    jevRun.running
                      ? "Stop after the current company"
                      : "Rate every company with Jev, in order — AI column stays put"
                  }
                >
                  {jevRun.running
                    ? `Jev ${jevRun.index}/${jevRun.total}${jevRun.company ? ` · ${jevRun.company}` : ""}`
                    : jevRun.total > 0 && jevRun.index >= jevRun.total
                      ? `Jev done ${jevRun.total - jevRun.failed}/${jevRun.total}`
                      : "Jev"}
                </button>
              )}
              <button
                onClick={viewPage === "sourcing" ? sourcing.refresh : refresh}
                disabled={headerRefreshing}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:bg-sidebar-active disabled:opacity-60"
              >
                <RefreshIcon
                  className={`h-3.5 w-3.5 ${headerRefreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>
          </div>

          {showSkeleton ? (
            <DashboardSkeleton />
          ) : (
            <>
              {inboundChrome && (
                <InfoReplyTray
                  newReplies={visibleReplies}
                  allReplies={allReplies}
                  isSeen={isReplySeen}
                  onOpen={openDeal}
                />
              )}
              {viewPage === "home" ? (
            <HomeView
              deals={visibleDeals}
              onOpen={openDeal}
              onNavigate={goInbounds}
              isUnread={isUnread}
              isPinnedDismissed={isPinnedDismissed}
            />
          ) : viewPage === "team" ? (
            <TeamView currentEmail={me.email} currentName={me.name} />
          ) : viewPage === "sourcing" ? (
            <SourcingView
              sourced={sourcing.sourced}
              configured={sourcing.configured}
              error={sourcing.error}
              onOpen={openSourcing}
              onConnectSheet={sourcing.connectSheet}
              onMoveStage={sourcing.setBoardStage}
            />
          ) : (
            <InboundsView
              deals={visibleDeals}
              stage={stage}
              onStageChange={setStage}
              stageCounts={stageCounts}
              isUnread={isUnread}
              isPinnedDismissed={isPinnedDismissed}
              onOpen={openDeal}
              onDealUpdated={patchDeal}
              replyDeals={visibleReplies}
              jevActiveRow={jevRun.running ? jevRun.rowIndex : null}
            />
          )}
            </>
          )}
        </div>
      </div>

      <DealModal
        deal={selected}
        onClose={closeDeal}
        onDealUpdated={patchDeal}
      />

      <SourcingModal
        item={selectedSourcing}
        onClose={closeSourcing}
        tracxnEnabled={Boolean(sourcing.tracxnEnabled)}
      />

      {inviteOpen && (
        <InviteTeamModal
          onClose={() => setInviteOpen(false)}
          invitedBy={me.name || me.email}
        />
      )}

      {profileOpen && me.email && (
        <ProfileSettingsModal
          email={me.email}
          initialName={me.name || ""}
          onClose={() => setProfileOpen(false)}
          onSaved={(name) => setMe((m) => ({ ...m, name, onboarded: true }))}
          onLogout={logout}
        />
      )}

      {showOnboarding && me.email && (
        <OnboardingModal
          email={me.email}
          initialName={me.name || ""}
          onComplete={(name) =>
            setMe((m) => ({ ...m, name, onboarded: true }))
          }
        />
      )}
    </div>
  );
}
