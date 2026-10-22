"use client";

import { useState } from "react";
import { BUCKET_OPTIONS, type Deal } from "@/lib/types";
import { prettyDomain, toHref } from "@/lib/deal-utils";
import { parseInfoReplyNote } from "@/lib/useInfoReplies";
import {
  DeckIcon,
  ExternalIcon,
  GlobeIcon,
  LinkedInIcon,
  MailIcon,
} from "./icons";
import { isLocalLab } from "@/lib/local-lab";
import { StarRating, WorthBadgePill } from "./WorthBadge";
import { LinkedInPreviewCard } from "./LinkedInPreviewCard";
import { AttioPushPanel } from "./AttioPushPanel";

function BucketDropdown({
  deal,
  onBucketed,
}: {
  deal: Deal;
  onBucketed?: (patch: Partial<Deal>) => void;
}) {
  const [value, setValue] = useState(deal.manualBucket ?? "");
  const [status, setStatus] = useState<"idle" | "confirm" | "saving" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  const selected = BUCKET_OPTIONS.find((b) => b.value === value);
  const willEmail = Boolean(
    value !== "pass_temporary" && deal.senderEmail?.includes("@"),
  );
  const isForcePass =
    value === "pass" &&
    (deal.manualBucket === "pass" ||
      Boolean(deal.manualBucket?.startsWith("call_with_")));

  const requestMove = () => {
    if (!value) {
      setStatus("error");
      setMessage("Select a bucket first.");
      return;
    }
    setMessage(null);
    setStatus("confirm");
  };

  const cancelConfirm = () => {
    setStatus("idle");
    setMessage(null);
  };

  const confirmMove = async () => {
    if (!value) return;
    setStatus("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/deals/bucket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowIndex: deal.rowIndex,
          bucket: value,
          founderEmail: deal.senderEmail,
          founderName: deal.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Failed to save.");
        return;
      }
      setStatus("done");
      onBucketed?.({
        manualBucket: value,
        manualBucketAt: new Date().toISOString(),
        status:
          data.status ||
          (value === "pass" ||
          value === "pass_temporary" ||
          value === "pass_by_aditya"
            ? "Pass"
            : value === "request_info"
              ? "Requested"
              : "Meeting"),
        action:
          data.action ||
          (value === "pass" ||
          value === "pass_temporary" ||
          value === "pass_by_aditya"
            ? value === "pass_temporary"
              ? "Pass (temporary)"
              : "Pass"
            : selected?.label || ""),
        actionDate: data.actionDate || new Date().toISOString().slice(0, 10),
      });
      if (value === "pass") {
        setMessage(
          data.emailSent
            ? "Force Pass done — founder emailed, stage Passed."
            : data.emailError ||
                "Marked as Pass — stage Passed (no email sent).",
        );
      } else if (value === "pass_temporary") {
        setMessage("Moved to Passed temporarily. No email or Attio update was triggered.");
      } else if (value === "pass_by_aditya") {
        setMessage(
          data.emailSent
            ? "Pass by Aditya sent — founder emailed from adityasingh@."
            : data.emailError ||
                "Marked as Pass by Aditya — no email was sent.",
        );
      } else if (value === "request_info") {
        setMessage(
          data.emailSent
            ? "Request Info sent from Aditya. We'll flag the deal when they reply."
            : data.emailError ||
                "Marked Request Info — no email was sent.",
        );
      } else if (data.emailSent && data.briefSent) {
        setMessage(
          `Calendar link sent to ${deal.senderEmail}. A private brief went to ${selected?.label.replace(/^Call with /, "") || "that teammate"}.`,
        );
      } else if (data.emailSent) {
        setMessage(
          `Calendar link sent to ${deal.senderEmail}. ${data.briefError || "The private brief was not sent."}`,
        );
      } else if (data.briefSent) {
        setMessage(
          data.emailError ||
            `Bucket saved. A private brief went to ${selected?.label.replace(/^Call with /, "") || "that teammate"}.`,
        );
      } else {
        setMessage(data.emailError || data.briefError || "Bucket saved, but no email was sent.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div
      className="w-full rounded-xl border border-border bg-surface-muted/40 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
        Move to bucket
      </div>

      <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
        <select
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus("idle");
            setMessage(null);
          }}
          disabled={status === "saving"}
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-white px-3 py-3 text-[14px] font-semibold outline-none focus:border-foreground disabled:opacity-60"
        >
          <option value="" disabled>
            Select bucket…
          </option>
          {BUCKET_OPTIONS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={requestMove}
          disabled={!value || status === "saving" || status === "confirm"}
          className="w-full shrink-0 rounded-lg bg-foreground px-5 py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[180px]"
        >
          Move to bucket
        </button>
      </div>

      {status === "confirm" && selected && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-[13px] font-semibold text-amber-950">
            Are you sure you want to move this to {selected.label}?
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-amber-900">
            {value === "pass"
              ? isForcePass
                ? "This force-overrides the current bucket to Pass and emails the founder the pass note now (skips the 24h auto-pass wait)."
                : "This marks the deal as Pass and emails the founder a polite pass note now."
              : value === "pass_temporary"
                ? "This only moves the deal to Passed in TOFU. It does not email the founder or update Attio."
              : value === "pass_by_aditya"
                ? "This marks the deal as Pass and emails the founder from Aditya (Regards, Aditya). No CC."
                : value === "request_info"
                  ? "This emails the founder from Aditya asking for a deck, team background, and traction. When they reply, a tray appears at the top of the dashboard until you open it."
                  : willEmail
                    ? `This emails ${deal.senderEmail} a calendar link for ${selected.label.replace(/^Call with /, "")}, and separately emails that teammate a private brief with the deck and everything we have on the founder. The founder does not get the brief.`
                    : "Bucket will be saved. No founder email is on file, so the calendar note will not go out. The teammate still gets a private brief."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmMove}
              className="rounded-lg bg-foreground px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
            >
              Yes,{" "}
              {value === "pass"
                ? isForcePass
                  ? "force Pass & email"
                  : "mark Pass & email"
                : value === "pass_temporary"
                  ? "move to Passed only"
                : value === "pass_by_aditya"
                  ? "pass as Aditya & email"
                  : value === "request_info"
                    ? "request info & email"
                    : "send it"}
            </button>
            <button
              type="button"
              onClick={cancelConfirm}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-[13px] font-semibold text-amber-950 hover:bg-amber-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "saving" && (
        <p className="mt-2.5 text-[12.5px] text-muted">Saving…</p>
      )}

      {message && (
        <p
          className={`mt-2.5 text-[12.5px] font-medium ${
            status === "error" ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}

function LinkChip({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string | null;
}) {
  if (!href)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-muted-2">
        {icon}
        {label}
      </span>
    );
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="group inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-surface-muted"
    >
      {icon}
      {label}
      <ExternalIcon className="h-3 w-3 text-muted-2 transition-colors group-hover:text-foreground" />
    </a>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">
        {label}
      </div>
      <div className="mt-0.5 truncate text-[13px] font-medium" title={value}>
        {value || "—"}
      </div>
    </div>
  );
}

export function DealDetails({
  deal,
  variant = "inline",
  onBucketed,
}: {
  deal: Deal;
  variant?: "inline" | "modal";
  onBucketed?: (patch: Partial<Deal>) => void;
}) {
  const showJev = isLocalLab();
  const wrapper =
    variant === "modal"
      ? ""
      : "fade-in border-t border-border bg-surface-muted/40 px-5 py-5";

  return (
    <div className={wrapper}>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Left: narrative */}
        <div className="space-y-4">
          {deal.infoRepliedAt && (
            <div className="overflow-hidden rounded-xl border border-sky-200 bg-sky-50">
              <div className="px-4 py-2.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-sky-800">
                  {deal.company || "Company"}
                </h4>
              </div>
              <div className="border-t border-sky-200 bg-white px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-sky-800">
                  Replied mail
                </p>
                {(() => {
                  const reply = parseInfoReplyNote(deal.infoReplyNote);
                  return (
                    <>
                      {reply.subject ? (
                        <p className="mt-1 text-[13.5px] font-semibold text-sky-950">
                          {reply.subject}
                        </p>
                      ) : null}
                      <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-sky-950">
                        {reply.body ||
                          deal.infoReplyNote ||
                          "They sent a follow-up after Request Info."}
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {deal.blurb && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                One-liner
              </h4>
              <p className="text-[14px] font-medium leading-relaxed">
                {deal.blurb}
              </p>
            </div>
          )}
          {deal.summary && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                Evaluation summary
              </h4>
              <p className="text-[13.5px] leading-relaxed text-neutral-700">
                {deal.summary}
              </p>
            </div>
          )}

          {(deal.aiSummary || (showJev && deal.jevSummary)) && (
            <div className={showJev ? "grid gap-3 sm:grid-cols-2" : ""}>
              <div className="rounded-xl border border-border bg-surface px-3 py-3">
                <h4 className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                  AI rating
                  <StarRating stars={deal.aiRatingStars} />
                  <WorthBadgePill deal={deal} />
                </h4>
                <p className="text-[13.5px] leading-relaxed text-neutral-700">
                  {deal.aiSummary || "Not rated."}
                </p>
              </div>
              {showJev ? (
              <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-3">
                <h4 className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                  Jev rating
                  <StarRating stars={deal.jevRatingStars} />
                  <WorthBadgePill
                    worth={deal.jevWorth}
                    stars={deal.jevRatingStars}
                  />
                </h4>
                <p className="text-[13.5px] leading-relaxed text-neutral-700">
                  {deal.jevSummary || "Not rated. Use the Jev button to run."}
                </p>
              </div>
              ) : null}
            </div>
          )}

          {deal.deckSummary &&
            !deal.deckSummary.trim().startsWith("{") &&
            !/"experience"\s*:\s*\[/.test(deal.deckSummary) &&
            !/^\s*Work experience\b/i.test(deal.deckSummary) && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                Deck — founders & raise
              </h4>
              <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-neutral-700">
                {deal.deckSummary}
              </p>
            </div>
          )}

          {/* LinkedIn preview — always under narrative, never dump raw JSON */}
          <LinkedInPreviewCard deal={deal} />

          <div className="flex flex-wrap gap-2 pt-1">
            <LinkChip
              icon={<GlobeIcon className="h-3.5 w-3.5" />}
              label={deal.website ? prettyDomain(deal.website) : "No website"}
              href={toHref(deal.website)}
            />
            <LinkChip
              icon={<DeckIcon className="h-3.5 w-3.5" />}
              label="Pitch deck"
              href={toHref(deal.deckLink)}
            />
            <LinkChip
              icon={<LinkedInIcon className="h-3.5 w-3.5" />}
              label="LinkedIn"
              href={toHref(deal.linkedin)}
            />
            <LinkChip
              icon={<MailIcon className="h-3.5 w-3.5" />}
              label={deal.senderEmail || "No email"}
              href={deal.senderEmail ? `mailto:${deal.senderEmail}` : null}
            />
          </div>
        </div>

        {/* Right: structured fields */}
        <div className="grid grid-cols-2 gap-2.5 self-start">
          <Field label="Founder" value={deal.name} />
          <Field label="Sector" value={deal.sector} />
          <Field label="Received" value={deal.dateReceived ?? "—"} />
          <Field
            label="Elite school"
            value={
              deal.eliteSchool ||
              (deal.linkedinCollege || "").split("\n")[0] ||
              "—"
            }
          />
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">
              AI stars
            </div>
            <div className="mt-1">
              <StarRating stars={deal.aiRatingStars} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-3 py-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">
              AI worth?
            </div>
            <div className="mt-1">
              <WorthBadgePill deal={deal} />
            </div>
          </div>
          {showJev ? (
          <>
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-violet-800">
              Jev stars
            </div>
            <div className="mt-1">
              <StarRating stars={deal.jevRatingStars} />
            </div>
          </div>
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 px-3 py-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-violet-800">
              Jev worth?
            </div>
            <div className="mt-1">
              <WorthBadgePill
                worth={deal.jevWorth}
                stars={deal.jevRatingStars}
              />
            </div>
          </div>
          </>
          ) : null}
          <Field label="Action" value={deal.action} />
          <Field label="Action date" value={deal.actionDate ?? "—"} />
          {deal.manualBucket && (
            <Field
              label="Bucket"
              value={
                BUCKET_OPTIONS.find((b) => b.value === deal.manualBucket)?.label ??
                (deal.manualBucket.startsWith("call_with_")
                  ? "Meeting (retired bucket)"
                  : deal.manualBucket)
              }
            />
          )}
          <div className="col-span-2">
            <Field label="Thread ID" value={deal.threadId} />
          </div>
        </div>
      </div>

      {/* Full-width action row — spans the whole deal modal */}
      <div className="mt-5 space-y-3">
        <BucketDropdown deal={deal} onBucketed={onBucketed} />
        <AttioPushPanel
          label={deal.company || deal.name || "this deal"}
          push={async (stage, ownerEmail) => {
            const res = await fetch("/api/deals/attio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                rowIndex: deal.rowIndex,
                stage,
                ownerEmail,
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
    </div>
  );
}
