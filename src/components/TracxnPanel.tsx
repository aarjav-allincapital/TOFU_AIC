"use client";

import { useEffect, useState } from "react";
import { sourcingBoardKey } from "@/lib/sourcing/board";
import type { SourcedFounder } from "@/lib/sourcing/types";
import { tracxnDomain } from "@/lib/tracxn/domain";
import {
  TRACXN_VIA_LABEL,
  type TracxnProfile,
  type TracxnVia,
} from "@/lib/tracxn/types";
import { ExternalIcon } from "./icons";
import { LinkedInAvatar } from "./LinkedInPreviewCard";

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m] = iso.split("-");
  if (!m) return y;
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", {
    month: "short",
  });
  return `${month} ${y}`;
}

/** One-line summary for cards: "Seed · $2.1M · 2023". */
export function tracxnSummary(profile: TracxnProfile): string {
  return [
    profile.stage,
    formatUsd(profile.totalEquityFundingUsd),
    profile.foundedYear ? String(profile.foundedYear) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function Stat({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[13.5px] font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function Profile({ profile }: { profile: TracxnProfile }) {
  const funding =
    formatUsd(profile.totalEquityFundingUsd) || (profile.funded ? "Funded" : "Unfunded");
  const latest = profile.latestRound
    ? [profile.latestRound.name, formatUsd(profile.latestRound.usd), formatDate(profile.latestRound.date)]
        .filter(Boolean)
        .join(" · ")
    : "";
  const valuation = profile.valuationUsd
    ? profile.valuationUsd.min && profile.valuationUsd.max && profile.valuationUsd.min !== profile.valuationUsd.max
      ? `${formatUsd(profile.valuationUsd.min)}–${formatUsd(profile.valuationUsd.max)}`
      : formatUsd(profile.valuationUsd.max ?? profile.valuationUsd.min)
    : "";
  const employees = profile.employeeCount
    ? `${profile.employeeCount.toLocaleString("en-US")}${
        profile.employeeCountAsOn ? ` (${formatDate(profile.employeeCountAsOn)})` : ""
      }`
    : "";
  const revenue = profile.revenueUsd
    ? `${formatUsd(profile.revenueUsd)}${profile.revenueAsOn ? ` (FY${profile.revenueAsOn.slice(0, 4)})` : ""}`
    : "";

  return (
    <>
      <div className="flex items-start gap-3">
        <LinkedInAvatar
          src={profile.logo}
          name={profile.name}
          size={44}
          rounded="rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="text-[15px] font-bold leading-tight text-neutral-900">
              {profile.name}
            </div>
            {profile.stage ? (
              <span className="rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-neutral-700">
                {profile.stage}
              </span>
            ) : null}
            {profile.xcorn ? (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">
                {profile.xcorn}
              </span>
            ) : null}
          </div>
          {profile.shortDescription ? (
            <p className="mt-1 text-[13px] leading-snug text-neutral-600">
              {profile.shortDescription}
            </p>
          ) : null}
          <div className="mt-1 text-[12px] text-neutral-400">
            {[
              profile.location,
              profile.foundedYear ? `Founded ${profile.foundedYear}` : "",
              profile.practiceAreas[0],
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Stat label="Total funding" value={funding} />
        <Stat label="Latest round" value={latest} />
        <Stat label="Valuation" value={valuation} />
        <Stat label="Employees" value={employees} />
        <Stat label="Revenue" value={revenue} />
        <Stat
          label="Tracxn score"
          value={profile.tracxnScore !== null ? `${profile.tracxnScore}/100` : ""}
        />
      </div>

      {profile.investors.length > 0 ? (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            Investors
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {profile.investors.slice(0, 8).map((inv) => (
              <span
                key={inv.name}
                className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[12px] font-medium text-neutral-800"
                title={inv.type}
              >
                {inv.name}
              </span>
            ))}
            {profile.investors.length > 8 ? (
              <span className="self-center text-[12px] text-neutral-400">
                +{profile.investors.length - 8} more
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {profile.keyPeople.length > 0 ? (
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
            Key people
          </div>
          <ul className="mt-1.5 space-y-1">
            {profile.keyPeople.map((p) => (
              <li key={`${p.name}-${p.designation}`} className="text-[13px] text-neutral-800">
                <span className="font-semibold">{p.name}</span>
                {p.designation ? (
                  <span className="text-neutral-500"> · {p.designation}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {profile.incubators.length > 0 ? (
        <div className="mt-3 text-[12.5px] text-neutral-600">
          <span className="font-semibold text-neutral-800">Accelerators:</span>{" "}
          {profile.incubators.join(", ")}
        </div>
      ) : null}

      {profile.editorRationale ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-neutral-600">
          {profile.editorRationale}
        </p>
      ) : null}
    </>
  );
}

export function TracxnPanel({
  item,
  enabled,
  onProfile,
}: {
  item: SourcedFounder;
  enabled: boolean;
  onProfile?: (profile: TracxnProfile | null, via: TracxnVia) => void;
}) {
  const [profile, setProfile] = useState<TracxnProfile | null>(item.tracxn ?? null);
  const [via, setVia] = useState<TracxnVia | null>(item.tracxnVia ?? null);
  const [domain, setDomain] = useState(tracxnDomain(item.website));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(item.tracxn ?? null);
    setVia(item.tracxnVia ?? null);
    setDomain(tracxnDomain(item.website));
    setError(null);
  }, [item.rowIndex, item.tracxn, item.tracxnVia, item.website]);

  const lookup = async (force = false) => {
    const clean = tracxnDomain(domain);
    if (!clean) {
      setError("Enter the company website, e.g. acme.com.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sourcing/tracxn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: clean,
          founderKey: sourcingBoardKey(item),
          force,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        via?: TracxnVia | "skipped";
        profile?: TracxnProfile | null;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error || "Tracxn lookup failed.");
      if (data.via && data.via !== "skipped") {
        setVia(data.via);
        setProfile(data.profile ?? null);
        onProfile?.(data.profile ?? null, data.via);
        if (data.via !== "ok") setError(data.message || TRACXN_VIA_LABEL[data.via]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tracxn lookup failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled && !profile) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
      {profile ? (
        <Profile profile={profile} />
      ) : (
        <div>
          <div className="text-[13px] font-semibold text-neutral-900">
            {via ? TRACXN_VIA_LABEL[via] : "Not checked on Tracxn yet"}
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-neutral-500">
            {domain
              ? "Lookups run automatically from the company website. Retry or correct the domain below."
              : "No website on this card. Enter the company domain to pull Tracxn data."}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-neutral-100 pt-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-neutral-500">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M2 2h12v3H9.5v9h-3V5H2z" />
          </svg>
          Tracxn
          {profile?.website ? (
            <a
              href={profile.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-neutral-400 hover:text-neutral-700"
            >
              {profile.domain || profile.website}
              <ExternalIcon className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        <form
          className="flex flex-1 items-center gap-2 sm:justify-end"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup(Boolean(profile));
          }}
        >
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="company.com"
            aria-label="Company domain for Tracxn"
            className="h-8 w-full max-w-[220px] rounded-md border border-neutral-200 bg-white px-2.5 text-[12.5px] outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
          <button
            type="submit"
            disabled={busy || !enabled}
            className="h-8 shrink-0 rounded-md bg-neutral-950 px-3 text-[12px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy ? "Looking up…" : profile ? "Refresh" : "Find on Tracxn"}
          </button>
        </form>
      </div>
      {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
    </div>
  );
}
