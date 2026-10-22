"use client";

import { useState } from "react";
import type { Deal } from "@/lib/types";
import { classifyStage, initials, relativeTime } from "@/lib/deal-utils";
import { parseInfoReplyNote } from "@/lib/useInfoReplies";
import { MailIcon } from "./icons";

/**
 * Founder replies after Request Info.
 *  - Newest unread reply shows expanded, once, until the deal is clicked open.
 *  - Older / other replies sit in a collapsed "All replies" dropdown.
 *  - When every reply has been clicked, the tray unmounts.
 */
export function InfoReplyTray({
  newReplies,
  allReplies,
  isSeen,
  onOpen,
}: {
  newReplies: Deal[];
  allReplies: Deal[];
  isSeen: (deal: Deal) => boolean;
  onOpen: (row: number) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (newReplies.length === 0) return null;

  const latest = newReplies[0];
  const dropdownReplies = allReplies.filter(
    (d) => d.rowIndex !== latest.rowIndex,
  );

  return (
    <div className="reply-tray-in mb-4 overflow-hidden rounded-xl border border-sky-200 bg-sky-50 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-bold text-sky-950">
            Founder replied
            <span className="rounded-md bg-sky-600 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
              {newReplies.length} new
            </span>
          </p>
          <p className="mt-0.5 text-[12px] text-sky-800">
            Click to open — this card then leaves the tray.
          </p>
        </div>

        {dropdownReplies.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
              showAll
                ? "border-sky-300 bg-white text-sky-950"
                : "border-sky-200 bg-sky-100/60 text-sky-900 hover:bg-white"
            }`}
          >
            All replies
            <span className="rounded bg-sky-200 px-1.5 py-px text-[11px] font-bold tabular-nums text-sky-900">
              {allReplies.length}
            </span>
            <span
              className={`text-[11px] transition-transform ${showAll ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>
        )}
      </div>

      <ul className="space-y-2 border-t border-sky-200 bg-sky-50/40 p-2">
        <ReplyEntity deal={latest} onOpen={onOpen} />
      </ul>

      {showAll && dropdownReplies.length > 0 && (
        <div className="border-t border-sky-200 bg-white">
          <ul className="divide-y divide-sky-100">
            {dropdownReplies.map((deal) => (
              <ReplyRow
                key={`${deal.rowIndex}-${deal.infoRepliedAt}-all`}
                deal={deal}
                seen={isSeen(deal)}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReplyRow({
  deal,
  seen,
  onOpen,
}: {
  deal: Deal;
  seen: boolean;
  onOpen: (row: number) => void;
}) {
  const { subject, body } = parseInfoReplyNote(deal.infoReplyNote);
  const line = (subject || body || "Follow-up from founder")
    .replace(/\s+/g, " ")
    .trim();
  const ms = Date.parse(deal.infoRepliedAt || "");

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(deal.rowIndex)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-sky-50"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${
            seen
              ? "border-border bg-surface-muted text-muted"
              : "border-sky-200 bg-sky-50 text-sky-900"
          }`}
        >
          {initials(deal.company, deal.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-[13px] ${
                seen ? "font-medium text-foreground" : "font-bold text-sky-950"
              }`}
            >
              {deal.company || deal.name || "Untitled"}
            </span>
            {!seen && (
              <span className="shrink-0 rounded bg-sky-600 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-white">
                New
              </span>
            )}
          </div>
          <div className="truncate text-[12px] text-muted">
            {deal.name || deal.senderEmail || "Founder"} · {line}
          </div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-2">
          {Number.isFinite(ms) ? relativeTime(ms) : ""}
        </span>
      </button>
    </li>
  );
}

function ReplyEntity({
  deal,
  onOpen,
}: {
  deal: Deal;
  onOpen: (row: number) => void;
}) {
  const { subject, body } = parseInfoReplyNote(deal.infoReplyNote);
  const preview = (body || "They sent a follow-up after Request Info.")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <li className="overflow-hidden rounded-lg border border-sky-200 bg-white">
      <button
        type="button"
        onClick={() => onOpen(deal.rowIndex)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-sky-50/80"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-sky-100 bg-sky-50 text-[11px] font-bold text-sky-900">
          {initials(deal.company, deal.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-foreground">
            {deal.company || deal.name || "Untitled"}
          </div>
          <div className="truncate text-[12px] text-muted">
            {deal.name || deal.senderEmail || "Founder"} ·{" "}
            {classifyStage(deal)} · replied{" "}
            {relativeTime(Date.parse(deal.infoRepliedAt || "") || null)}
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          New reply
        </span>
      </button>

      <button
        type="button"
        onClick={() => onOpen(deal.rowIndex)}
        className="flex w-full items-start gap-3 border-t border-sky-100 bg-sky-50/50 px-3 py-3 pl-12 text-left hover:bg-sky-50"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sky-200 bg-white text-sky-800">
          <MailIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-sky-800">
            Replied mail
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-foreground">
            {subject || "Follow-up from founder"}
          </div>
          <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
            {preview}
          </div>
        </div>
        <span className="shrink-0 pt-1 text-[11px] font-semibold text-sky-800">
          Open →
        </span>
      </button>
    </li>
  );
}
