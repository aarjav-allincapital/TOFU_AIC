"use client";

import { useState } from "react";
import {
  DEAL_FLOW_OWNERS,
  DEAL_FLOW_STAGES,
  dealFlowOwnerLabel,
} from "@/lib/attio/deal-flow-options";

export type AttioPushResponse = {
  status?: "created" | "moved" | "unchanged" | string;
  previousStage?: string | null;
  ownerSet?: boolean;
  ownerError?: string | null;
};

export function AttioPushPanel({
  label,
  push,
}: {
  label: string;
  push: (stage: string, ownerEmail: string | null) => Promise<AttioPushResponse>;
}) {
  const [stage, setStage] = useState<string>("New Lead");
  const [owner, setOwner] = useState<string>("");
  const [status, setStatus] = useState<
    "idle" | "confirm" | "saving" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  const ownerLabel = dealFlowOwnerLabel(owner);
  const target = ownerLabel ? `${stage} · owner ${ownerLabel}` : stage;
  const company = label.trim() || "this company";

  const reset = () => {
    setStatus("idle");
    setMessage(null);
  };

  const confirmPush = async () => {
    setStatus("saving");
    setMessage(null);
    try {
      const data = await push(stage, owner || null);
      setStatus("done");
      const ownerNote = data.ownerSet
        ? ` Owner: ${ownerLabel}.`
        : data.ownerError
          ? ` ${data.ownerError}`
          : "";
      if (data.status === "created") {
        setMessage(`${company} added to Deal Flow → ${stage}.${ownerNote}`);
      } else if (data.status === "moved") {
        setMessage(
          `${company} was already on Deal Flow (${data.previousStage}) — moved to ${stage}.${ownerNote}`,
        );
      } else {
        setMessage(`${company} is already on Deal Flow in ${stage}.${ownerNote}`);
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Failed to add to Attio.");
    }
  };

  const selectClass =
    "min-w-0 flex-1 rounded-lg border border-border-strong bg-white px-3 py-3 text-[14px] font-semibold outline-none focus:border-foreground disabled:opacity-60";

  return (
    <div
      className="w-full rounded-xl border border-border bg-surface-muted/40 p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
        Add to Attio · Deal Flow
      </div>

      <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-stretch">
        <select
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            reset();
          }}
          disabled={status === "saving"}
          className={selectClass}
          aria-label="Deal Flow column"
        >
          {DEAL_FLOW_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            reset();
          }}
          disabled={status === "saving"}
          className={selectClass}
          aria-label="Owner"
        >
          <option value="">No owner</option>
          {DEAL_FLOW_OWNERS.map((o) => (
            <option key={o.email} value={o.email}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setStatus("confirm");
          }}
          disabled={status === "saving" || status === "confirm"}
          className="w-full shrink-0 rounded-lg bg-foreground px-5 py-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[180px]"
        >
          Add to Attio
        </button>
      </div>

      {status === "confirm" && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-[13px] font-semibold text-amber-950">
            Add {company} to Deal Flow → {target}?
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-amber-900">
            Creates or updates the company in Attio and places its card in the{" "}
            {stage} column
            {ownerLabel ? ` with ${ownerLabel} as owner` : ""}. If the company
            is already on Deal Flow, its card moves to {stage}. No email is sent,
            and the card in TOFU stays as it is.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmPush}
              className="rounded-lg bg-foreground px-4 py-2 text-[13px] font-bold text-white hover:opacity-90"
            >
              Yes, add to Attio
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-[13px] font-semibold text-amber-950 hover:bg-amber-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "saving" && (
        <p className="mt-2.5 text-[12.5px] text-muted">Pushing to Attio…</p>
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
