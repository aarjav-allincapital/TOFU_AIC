"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  compactShareProfile,
  safePublicWebsite,
  shareOverview,
  shareText,
  shareTitle,
  type ShareCardFields,
} from "@/lib/sourcing/share-card";
import { ShareIcon } from "./icons";
import { ShareCard } from "./ShareCard";

type ShareItem = {
  company: string;
  founder: string;
  companyNote: string;
  domain: string;
  website: string;
  stageTimeline: string;
  funding: string;
  pedigree: string;
  hardware: string;
  moat: string;
  tam: string;
  auditStatus: string;
  linkedin: string;
  github: string;
  twitter: string;
  notes: string;
  linkedinPreview?: unknown;
};

export function ShareDealSheet({
  item,
  onClose,
}: {
  item: ShareItem;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [card, setCard] = useState<ShareCardFields>(() => ({
    company: item.company,
    founder: item.founder,
    blurb: shareOverview({
      companyNote: item.companyNote,
      domain: item.domain,
      founder: item.founder,
      company: item.company,
    }),
    website: safePublicWebsite(item.website),
    domain: item.domain,
    stageTimeline: item.stageTimeline,
    funding: item.funding,
    pedigree: item.pedigree,
    hardware: item.hardware,
    moat: item.moat,
    tam: item.tam,
    auditStatus: item.auditStatus,
    linkedin: safePublicWebsite(item.linkedin),
    github: safePublicWebsite(item.github),
    twitter: safePublicWebsite(item.twitter),
    notes: item.notes,
    ...compactShareProfile(item.linkedinPreview),
    sharedAt: new Date().toISOString(),
  }));
  const [busy, setBusy] = useState<"share" | "copy" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const prepare = async () => {
      try {
        const res = await fetch("/api/sourcing/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not create the card.");
        if (cancelled) return;
        setUrl(data.url);
        if (data.card) setCard(data.card);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not create the card.");
        }
      }
    };
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [item]);

  const share = () => {
    setError(null);
    setNotice(null);
    if (!url) {
      setError("The card is still being prepared.");
      return;
    }
    if (typeof navigator.share !== "function") {
      void copy();
      return;
    }
    setBusy("share");
    // The platform call must happen directly inside the click event. Do not
    // await image generation or another request before opening the share sheet.
    navigator
      .share({
        title: shareTitle(card.company, card.founder),
        text: shareText(card, url),
        url,
      })
      .then(() => setNotice("Shared."))
      .catch((err: unknown) => {
        if (
          err instanceof DOMException &&
          (err.name === "AbortError" || err.name === "NotAllowedError")
        ) {
          setNotice("Sharing was cancelled. You can copy the link instead.");
          return;
        }
        setError("This browser could not open sharing. Use Copy link instead.");
      })
      .finally(() => setBusy(null));
  };

  const copy = async () => {
    setError(null);
    setNotice(null);
    setBusy("copy");
    try {
      if (!url) throw new Error("The card is still being prepared.");
      await copyText(url);
      setNotice("Link copied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not copy the link.");
    } finally {
      setBusy(null);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto p-4 py-6">
      <button
        type="button"
        aria-label="Close share"
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-card-title"
        className="relative z-10 flex w-full max-w-[460px] flex-col items-center"
      >
        <p
          id="share-card-title"
          className="relative mb-4 text-[12px] font-semibold tracking-[0.16em] text-white/70 uppercase"
        >
          Share card
        </p>
        <div className="card-rise relative max-h-[60vh] w-full overflow-y-auto rounded-2xl sm:max-h-[66vh]">
          <ShareCard card={card} />
        </div>
        <p className="relative mt-4 max-w-sm break-all text-center text-[12px] leading-relaxed text-white/55">
          {url || "Preparing a short link anyone can open without signing in."}
        </p>
        <div className="relative mt-4 flex w-full max-w-[420px] gap-2">
          <button
            type="button"
            onClick={share}
            disabled={busy !== null || !url}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-[13px] font-semibold text-neutral-950 hover:bg-neutral-100 disabled:opacity-60"
          >
            <ShareIcon className="h-4 w-4" />
            {!url ? "Preparing card…" : busy === "share" ? "Opening…" : "Share"}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={busy !== null || !url}
            className="rounded-full border border-white/20 px-4 py-3 text-[13px] font-semibold text-white hover:bg-white/10 disabled:opacity-60"
          >
            {busy === "copy" ? "Copying…" : "Copy link"}
          </button>
        </div>
        {notice ? (
          <p className="relative mt-3 text-[12.5px] font-medium text-emerald-300">{notice}</p>
        ) : null}
        {error ? (
          <p className="relative mt-3 text-center text-[12.5px] text-red-300">{error}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) throw new Error("Copy is not available in this browser.");
  }
}
