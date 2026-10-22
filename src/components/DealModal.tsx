"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Deal } from "@/lib/types";
import { classifyStage, initials } from "@/lib/deal-utils";
import { DealDetails } from "./DealDetails";
import { StageBadge } from "./StageBadge";
import { CloseIcon } from "./icons";

export function DealModal({
  deal,
  onClose,
  onDealUpdated,
}: {
  deal: Deal | null;
  onClose: () => void;
  onDealUpdated?: (rowIndex: number, patch: Partial<Deal>) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [localDeal, setLocalDeal] = useState<Deal | null>(deal);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setLocalDeal(deal);
  }, [deal]);

  useEffect(() => {
    if (!deal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [deal, onClose]);

  if (!localDeal || !mounted) return null;

  const stage = classifyStage(localDeal);

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
        aria-labelledby="deal-modal-title"
        className="fade-in relative flex w-full max-w-[640px] max-h-[88vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-muted text-sm font-bold">
              {initials(localDeal.company, localDeal.name)}
            </div>
            <div className="min-w-0">
              <h2
                id="deal-modal-title"
                className="truncate text-lg font-bold leading-tight"
              >
                {localDeal.company || "Untitled"}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted">
                {localDeal.name}
                {localDeal.sector ? ` · ${localDeal.sector}` : ""}
              </p>
              <div className="mt-2">
                <StageBadge stage={stage} />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <DealDetails
            deal={localDeal}
            variant="modal"
            onBucketed={(patch) => {
              setLocalDeal((d) => (d ? { ...d, ...patch } : d));
              onDealUpdated?.(localDeal.rowIndex, patch);
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
