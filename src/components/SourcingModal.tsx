"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { relativeTime } from "@/lib/deal-utils";
import { prettyLinkHost } from "@/lib/sourcing/links";
import { sourcingTitle } from "@/lib/sourcing/display";
import type { SourcedFounder } from "@/lib/sourcing/types";
import {
  CloseIcon,
  ExternalIcon,
  GitHubIcon,
  GlobeIcon,
  LinkedInIcon,
  ShareIcon,
  XIcon,
} from "./icons";
import { ShareDealSheet } from "./ShareDealSheet";
import { LinkedInAvatar, LinkedInPreviewPanel } from "./LinkedInPreviewCard";
import { SourcingStatusBadge } from "./SourcingStatusBadge";
import { AttioPushPanel } from "./AttioPushPanel";
import { TracxnPanel } from "./TracxnPanel";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function LinkButton({
  href,
  label,
  icon,
  className,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  className: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors ${className}`}
    >
      {icon}
      {label}
      <ExternalIcon className="h-3 w-3 opacity-60" />
    </a>
  );
}

export function SourcingModal({
  item,
  onClose,
  tracxnEnabled = false,
}: {
  item: SourcedFounder | null;
  onClose: () => void;
  tracxnEnabled?: boolean;
}) {
  const mounted = useIsClient();
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    setShareOpen(false);
  }, [item?.rowIndex]);

  useEffect(() => {
    if (!item) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || shareOpen) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose, shareOpen]);

  if (!item || !mounted) return null;

  const preview = item.linkedinPreview;
  const avatarName = preview?.name || item.founder || item.company;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-neutral-900/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sourcing-modal-title"
        className="fade-in relative flex w-full max-w-[640px] max-h-[88vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <LinkedInAvatar
              src={preview?.avatar || ""}
              name={avatarName}
              size={52}
            />
            <div className="min-w-0">
              <h2
                id="sourcing-modal-title"
                className="text-lg font-bold leading-tight tracking-tight"
              >
                {sourcingTitle(item)}
              </h2>
              <p className="mt-0.5 text-[14px] leading-snug text-muted">
                {item.company.trim() ? item.founder : ""}
                {item.company.trim() && item.companyNote ? " · " : ""}
                {item.companyNote}
              </p>
              {preview?.headline ? (
                <p className="mt-1.5 text-[13px] leading-snug text-foreground/80">
                  {preview.headline}
                </p>
              ) : null}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <SourcingStatusBadge status={item.status} />
                {item.auditStatus ? (
                  <span className="inline-flex items-center rounded-md border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-800">
                    {item.auditStatus}
                  </span>
                ) : null}
                {item.stageTimeline ? (
                  <span className="rounded-md border border-border bg-surface-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted">
                    {item.stageTimeline}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-neutral-800"
            >
              <ShareIcon className="h-3.5 w-3.5" />
              Share
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sidebar-active hover:text-foreground"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {item.linkedin ? (
              <LinkButton
                href={item.linkedin}
                label="LinkedIn"
                icon={<LinkedInIcon className="h-3.5 w-3.5" />}
                className="border-[#0A66C2]/25 bg-[#0A66C2]/8 text-[#0A66C2] hover:bg-[#0A66C2]/15"
              />
            ) : null}
            {item.github ? (
              <LinkButton
                href={item.github}
                label="GitHub"
                icon={<GitHubIcon className="h-3.5 w-3.5" />}
                className="border-neutral-300 bg-neutral-50 text-neutral-800 hover:bg-neutral-100"
              />
            ) : null}
            {item.website ? (
              <LinkButton
                href={item.website}
                label={prettyLinkHost(item.website)}
                icon={<GlobeIcon className="h-3.5 w-3.5" />}
                className="border-border bg-surface text-foreground hover:bg-sidebar-active"
              />
            ) : null}
            {item.twitter ? (
              <LinkButton
                href={item.twitter}
                label="X"
                icon={<XIcon className="h-3.5 w-3.5" />}
                className="border-neutral-800/20 bg-neutral-900 text-white hover:bg-neutral-800"
              />
            ) : null}
            {item.addedAtMs ? (
              <span className="self-center text-[12px] text-muted-2">
                Added {relativeTime(item.addedAtMs)}
              </span>
            ) : null}
          </div>

          {item.linkedinPreview || item.linkedinCollege || item.linkedinEnrichedAt ? (
            <div className="mt-5">
              <LinkedInPreviewPanel
                linkedin={item.linkedin}
                preview={item.linkedinPreview}
                college={item.linkedinCollege}
                enrichedAt={item.linkedinEnrichedAt}
                enrichVia={item.linkedinEnrichVia}
              />
            </div>
          ) : null}

          {tracxnEnabled || item.tracxn ? (
            <div className="mt-5">
              <TracxnPanel item={item} enabled={tracxnEnabled} />
            </div>
          ) : null}

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Domain / sector" value={item.domain} wide />
            <Field label="Time building" value={item.stageTimeline} />
            <Field label="Funding / unfunded verification" value={item.funding} wide />
            <Field label="Location & technical pedigree" value={item.pedigree} wide />
            <Field
              label="Hardware & technical architecture"
              value={item.hardware}
              wide
            />
            <Field label="Engineering moat & novelty" value={item.moat} wide />
            <Field label="Target market & TAM" value={item.tam} wide />
            {item.notes ? <Field label="Notes" value={item.notes} wide /> : null}
          </dl>

          <div className="mt-6">
            <AttioPushPanel
              label={sourcingTitle(item)}
              push={async (stage, ownerEmail) => {
                const res = await fetch("/api/sourcing/attio", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    stage,
                    ownerEmail,
                    rowIndex: item.rowIndex,
                    founder: item.founder,
                    company: item.company,
                    website: item.website,
                    linkedin: item.linkedin,
                    companyNote: item.companyNote,
                    pedigree: item.pedigree,
                    funding: item.funding,
                    notes: item.notes,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  throw new Error(data.error || "Failed to add to Attio.");
                }
                return data;
              }}
            />
          </div>

          {item.raw ? (
            <div className="mt-6">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                Source dump
              </div>
              <pre className="max-h-40 overflow-auto rounded-xl border border-border bg-surface-muted px-3.5 py-3 text-[12px] leading-relaxed whitespace-pre-wrap text-muted">
                {item.raw}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
      {shareOpen ? (
        <ShareDealSheet
          item={item}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}

function Field({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
        {label}
      </dt>
      <dd className="mt-1.5 text-[14px] leading-relaxed text-foreground">
        {value}
      </dd>
    </div>
  );
}
