"use client";

import { useState } from "react";
import type { Deal } from "@/lib/types";
import {
  parseStoredLinkedInPreview,
  type LinkedInPreview,
} from "@/lib/linkedin/preview";
import { normalizeLinkedInProfileUrl } from "@/lib/linkedin/url";

function Initials({ name, size, rounded }: { name: string; size: number; rounded: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "?";
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-neutral-200 font-semibold text-neutral-600 ${rounded}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function LinkedInAvatar({
  src,
  name,
  size,
  rounded = "rounded-full",
}: {
  src: string;
  name: string;
  size: number;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <Initials name={name || "?"} size={size} rounded={rounded} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-cover bg-neutral-100 ${rounded}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}

export type LinkedInPreviewFields = {
  linkedin?: string | null;
  preview?: LinkedInPreview | null;
  workHistory?: string | null;
  college?: string | null;
  enrichedAt?: string | null;
  enrichVia?: string | null;
  compact?: boolean;
};

function resolvePreview(fields: LinkedInPreviewFields, url: string): LinkedInPreview | null {
  if (fields.preview) {
    return {
      ...fields.preview,
      url: fields.preview.url || url,
    };
  }
  return parseStoredLinkedInPreview(fields.workHistory, fields.college, url);
}

function PreviewBody({
  preview,
  pending,
  failed,
  compact,
}: {
  preview: LinkedInPreview | null;
  pending: boolean;
  failed: boolean;
  compact: boolean;
}) {
  if (preview) {
    const exp = preview.experience.slice(0, compact ? 2 : 3);
    const edu = preview.education.slice(0, compact ? 1 : 3);
    return (
      <>
        <div className="flex items-start gap-3">
          <LinkedInAvatar
            src={preview.avatar}
            name={preview.name || "Profile"}
            size={compact ? 44 : 56}
          />
          <div className="min-w-0 pt-0.5">
            <div
              className={`truncate font-bold leading-tight text-neutral-900 ${
                compact ? "text-[14.5px]" : "text-[16px]"
              }`}
            >
              {preview.name || "LinkedIn profile"}
            </div>
            {preview.headline ? (
              <p
                className={`mt-1 leading-snug text-neutral-600 ${
                  compact ? "line-clamp-2 text-[12.5px]" : "text-[13px]"
                }`}
              >
                {preview.headline}
              </p>
            ) : null}
          </div>
        </div>

        {exp.length > 0 ? (
          <div className={compact ? "mt-3" : "mt-4"}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Experience
            </div>
            <ul className={`mt-2 space-y-2.5 ${compact ? "" : "mt-2.5 space-y-3"}`}>
              {exp.map((e, i) => (
                <li
                  key={`${e.title}-${e.company}-${i}`}
                  className="flex items-start gap-2.5"
                >
                  <LinkedInAvatar
                    src={e.logo}
                    name={e.company || e.title}
                    size={compact ? 28 : 36}
                    rounded="rounded-md"
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold leading-snug text-neutral-900">
                      {e.title || e.company}
                    </div>
                    {e.title && e.company ? (
                      <div className="text-[12px] leading-snug text-neutral-600">
                        {e.company}
                      </div>
                    ) : null}
                    {e.duration ? (
                      <div className="mt-0.5 text-[11.5px] text-neutral-400">
                        {e.duration}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {edu.length > 0 ? (
          <div className={compact ? "mt-3" : "mt-4"}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Education
            </div>
            <ul className="mt-2 space-y-2.5">
              {edu.map((e, i) => (
                <li
                  key={`${e.school}-${i}`}
                  className="flex items-start gap-2.5"
                >
                  <LinkedInAvatar
                    src={e.logo}
                    name={e.school}
                    size={compact ? 28 : 36}
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold leading-snug text-neutral-900">
                      {e.school}
                    </div>
                    {e.degree ? (
                      <div className="text-[12px] leading-snug text-neutral-600">
                        {e.degree}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }

  if (pending) {
    return (
      <div className="py-1.5 text-[13px] text-neutral-500">
        Generating LinkedIn preview…
      </div>
    );
  }
  if (failed) {
    return (
      <div className="py-1.5 text-[13px] text-neutral-500">
        Couldn&apos;t load a public preview for this profile.
      </div>
    );
  }
  return (
    <div className="py-1.5 text-[13px] text-neutral-500">
      No public experience or education found.
    </div>
  );
}

export function LinkedInPreviewPanel({
  linkedin,
  preview,
  workHistory,
  college,
  enrichedAt,
  enrichVia,
  compact = false,
}: LinkedInPreviewFields) {
  const url = normalizeLinkedInProfileUrl(linkedin || "");
  if (!url) return null;

  const resolved = resolvePreview(
    { preview, workHistory, college },
    url,
  );
  const pending = !enrichedAt && !resolved;
  const failed = Boolean(enrichedAt) && !resolved && enrichVia !== "ok";

  return (
    <div className={compact ? "" : "space-y-2 pt-2"}>
      {compact ? null : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[12.5px] text-[#0A66C2] underline-offset-2 hover:underline"
        >
          {url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      )}

      <div
        className={`border border-neutral-200 bg-white shadow-sm ${
          compact ? "rounded-xl px-3 py-3" : "rounded-xl px-4 py-4"
        }`}
      >
        <PreviewBody
          preview={resolved}
          pending={pending}
          failed={failed}
          compact={compact}
        />
        {compact ? null : (
          <div className="mt-4 border-t border-neutral-100 pt-3">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#0A66C2]">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M8 0l1.8 5.5H16l-4.5 3.3L13.3 16 8 12.7 2.7 16l1.8-7.2L0 5.5h6.2z" />
              </svg>
              Preview
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-400">
              Previews are generated from public sources and may not be up to date.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * LinkedIn-style preview. Self-contained — never renders raw JSON.
 */
export function LinkedInPreviewCard({ deal }: { deal: Deal }) {
  return (
    <LinkedInPreviewPanel
      linkedin={deal.linkedin}
      workHistory={deal.linkedinWorkHistory}
      college={deal.linkedinCollege}
      enrichedAt={deal.linkedinEnrichedAt}
      enrichVia={deal.linkedinEnrichVia}
    />
  );
}
