"use client";

import Image from "next/image";
import { STAGE_ORDER, type Stage } from "@/lib/deal-utils";
import {
  ChevronIcon,
  CompassIcon,
  HomeIcon,
  InboxIcon,
  LogoutIcon,
  SettingsIcon,
  UserPlusIcon,
  UsersIcon,
} from "./icons";

export type Page = "home" | "inbounds" | "team" | "sourcing";
export type StageView = "All" | Stage;
export type NavTarget = { page: Page; stage?: StageView };

type NavItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
  target: NavTarget;
  count?: number;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export function Sidebar({
  activeKey,
  counts,
  total,
  newCount,
  collapsed,
  onToggleCollapse,
  onNavigate,
  currentEmail,
  currentName,
  onInvite,
  onProfile,
  onLogout,
  sourcingCount = 0,
}: {
  activeKey: string;
  counts: Record<Stage, number>;
  total: number;
  newCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (target: NavTarget) => void;
  currentEmail?: string | null;
  currentName?: string | null;
  onInvite?: () => void;
  onProfile?: () => void;
  onLogout?: () => void;
  sourcingCount?: number;
}) {
  const sections: NavSection[] = [
    {
      title: "Command center",
      items: [
        {
          key: "home",
          label: "Overview",
          icon: <HomeIcon className="h-[17px] w-[17px]" />,
          target: { page: "home" },
        },
        {
          key: "team",
          label: "Team",
          icon: <UsersIcon className="h-[17px] w-[17px]" />,
          target: { page: "team" },
        },
      ],
    },
    {
      title: "Inbound",
      items: [
        {
          key: "inbounds",
          label: "Inbounds",
          icon: <InboxIcon className="h-[17px] w-[17px]" />,
          target: { page: "inbounds", stage: "All" },
          count: total,
        },
      ],
    },
    {
      title: "Sourcing",
      items: [
        {
          key: "sourcing",
          label: "Deal sourcing",
          icon: <CompassIcon className="h-[17px] w-[17px]" />,
          target: { page: "sourcing" },
          count: sourcingCount,
        },
      ],
    },
    {
      title: "Pipeline",
      items: STAGE_ORDER.map((s) => ({
        key: s,
        label: s,
        icon: <span className="h-[18px] w-[18px]" />,
        target: { page: "inbounds", stage: s },
        count: counts[s],
      })),
    },
  ];

  const isActive = (item: NavItem) => item.key === activeKey;
  const initials = (currentName || currentEmail || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ${
        collapsed ? "w-[72px]" : "w-[240px]"
      }`}
    >
      <div className="border-b border-border">
        <div
          className={`flex h-[72px] items-center ${
            collapsed ? "justify-center px-2" : "px-4"
          }`}
        >
          <Image
            src="/all-in-logo.png"
            alt="All In Capital"
            width={132}
            height={36}
            className="shrink-0 object-contain"
            style={{ height: collapsed ? 26 : 34, width: "auto" }}
            priority
          />
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`flex items-center justify-center transition-colors ${
            collapsed
              ? "mx-auto mb-4 h-12 w-12 rounded-xl bg-foreground text-white hover:bg-neutral-700"
              : "mx-3 mb-3 h-10 w-[calc(100%_-_24px)] justify-start gap-3 rounded-lg border border-border-strong px-3 text-[13px] font-semibold text-foreground hover:bg-sidebar-active"
          }`}
        >
          <ChevronIcon
            className={`h-4 w-4 transition-transform ${
              collapsed ? "" : "rotate-180"
            }`}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) =>
          collapsed && section.title === "Pipeline" ? null : (
          <div key={section.title} className="mb-5 last:mb-0">
            {!collapsed && (
              <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                {section.title}
              </div>
            )}
            {collapsed && section.title !== "Command center" && (
              <div className="mx-1 mb-2 border-t border-border" />
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.key} className="relative">
                    <button
                      type="button"
                      title={collapsed ? item.label : undefined}
                      onClick={() => onNavigate(item.target)}
                      className={`flex w-full items-center rounded-lg text-[13px] font-medium transition-colors ${
                        collapsed
                          ? "justify-center px-0 py-2.5"
                          : "justify-between px-2.5 py-2"
                      } ${
                        active
                          ? "bg-sidebar-active text-foreground"
                          : "text-muted hover:bg-sidebar-active/70 hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`flex items-center ${collapsed ? "" : "gap-2.5"} min-w-0`}
                      >
                        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-muted">
                          {item.icon}
                        </span>
                        {!collapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </span>
                      {!collapsed && item.count != null && (
                        <span className="text-[11px] font-semibold tabular-nums text-muted-2">
                          {item.count}
                        </span>
                      )}
                    </button>
                    {collapsed &&
                      item.key === "inbounds" &&
                      newCount > 0 && (
                        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-sky-500" />
                      )}
                  </li>
                );
              })}
            </ul>
          </div>
          ),
        )}
      </nav>

      <div
        className={`border-t border-border py-3 ${collapsed ? "px-2" : "px-4"}`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              title={currentName || "Profile"}
              onClick={onProfile}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-white"
            >
              {initials}
            </button>
            <button
              type="button"
              title="Invite team"
              onClick={onInvite}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sidebar-active hover:text-foreground"
            >
              <UserPlusIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Log out"
              onClick={onLogout}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-sidebar-active hover:text-foreground"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onProfile}
              className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-sidebar-active"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-bold text-white">
                {initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-foreground">
                  {currentName || "Profile"}
                </span>
                <span className="block truncate text-[11px] text-muted-2">
                  {currentEmail}
                </span>
              </span>
              <SettingsIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onInvite}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[12px] font-semibold text-foreground hover:bg-sidebar-active"
              >
                <UserPlusIcon className="h-3.5 w-3.5" />
                Invite
              </button>
              <button
                type="button"
                onClick={onLogout}
                title="Log out"
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:bg-sidebar-active hover:text-foreground"
              >
                <LogoutIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
