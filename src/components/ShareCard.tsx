"use client";

import {
  formatShareDate,
  shareDetails,
  shareHost,
  shareTitle,
  type ShareCardFields,
} from "@/lib/sourcing/share-card";
import { LinkedInIcon } from "./icons";
import { LinkedInAvatar } from "./LinkedInPreviewCard";

export function ShareCard({
  card,
}: {
  card: ShareCardFields;
}) {
  const title = shareTitle(card.company, card.founder);
  const person = card.profileName || card.founder;
  const host = shareHost(card.website);
  const details = shareDetails(card);
  const links = [
    { label: host || "Website", href: card.website },
    { label: "GitHub", href: card.github },
    { label: "X", href: card.twitter },
  ].filter((link) => link.href);

  return (
    <article className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-neutral-200/90 bg-white font-sans text-neutral-950 shadow-[0_28px_70px_rgba(15,23,42,0.14)]">
      <div className="flex items-center border-b border-neutral-100 px-6 py-4">
        <img
          src="/all-in-logo.png"
          alt="All In Capital"
          width={148}
          height={75}
          className="h-9 w-auto object-contain object-left"
        />
      </div>

      <div className="px-6 py-5">
        <div className="flex items-start gap-4">
          <LinkedInAvatar
            src={card.avatar}
            name={person || title}
            size={72}
          />
          <div className="min-w-0 pt-0.5">
            <h1 className="text-[20px] font-semibold leading-tight tracking-tight">
              {person || title}
            </h1>
            {card.headline ? (
              <p className="mt-1.5 text-[13.5px] leading-snug text-neutral-600">
                {card.headline}
              </p>
            ) : null}
            <p className="mt-2 text-[13px] leading-snug text-neutral-500">
              {title}
              {card.founder && card.company && person !== card.founder
                ? ` · ${card.founder}`
                : ""}
            </p>
            {card.sharedAt ? (
              <p className="mt-1 text-[12px] text-neutral-400">
                {formatShareDate(card.sharedAt)}
              </p>
            ) : null}
            {card.linkedin ? (
              <a
                href={card.linkedin}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#0A66C2]/25 bg-[#0A66C2]/8 px-3 py-1.5 text-[12px] font-semibold text-[#0A66C2] hover:bg-[#0A66C2]/15"
              >
                <LinkedInIcon className="h-3.5 w-3.5" />
                View LinkedIn profile
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {card.experience.length > 0 || card.education.length > 0 ? (
        <div className="mx-6 border-t border-neutral-100 py-5">
          {card.experience.length > 0 ? (
            <section>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                Experience
              </h2>
              <ul className="mt-3 space-y-3">
                {card.experience.map((row, i) => (
                  <li
                    key={`${row.title}-${row.company}-${i}`}
                    className="flex items-start gap-2.5"
                  >
                    <LinkedInAvatar
                      src={row.logo}
                      name={row.company || row.title}
                      size={36}
                      rounded="rounded-md"
                    />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold leading-snug">
                        {row.title || row.company}
                      </div>
                      {row.title && row.company ? (
                        <div className="text-[12.5px] text-neutral-600">
                          {row.company}
                        </div>
                      ) : null}
                      {row.duration ? (
                        <div className="mt-0.5 text-[12px] text-neutral-400">
                          {row.duration}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {card.education.length > 0 ? (
            <section className={card.experience.length ? "mt-5" : ""}>
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                Education
              </h2>
              <ul className="mt-3 space-y-3">
                {card.education.map((row, i) => (
                  <li key={`${row.school}-${i}`} className="flex items-start gap-2.5">
                    <LinkedInAvatar
                      src={row.logo}
                      name={row.school}
                      size={36}
                      rounded="rounded-md"
                    />
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-semibold leading-snug">
                        {row.school}
                      </div>
                      {row.degree ? (
                        <div className="text-[12.5px] text-neutral-600">
                          {row.degree}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      <div className="px-6 pb-6">
        {card.blurb ? (
          <p className="text-[14.5px] leading-relaxed text-neutral-800">{card.blurb}</p>
        ) : null}

        {details.length ? (
          <dl className="mt-5 divide-y divide-neutral-100 border-y border-neutral-100">
            {details.map(({ label, value }) => (
              <div key={label} className="py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                  {label}
                </dt>
                <dd className="mt-1 text-[13.5px] leading-relaxed text-neutral-800">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {links.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {links.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold text-neutral-700 hover:border-neutral-400 hover:text-neutral-950"
              >
                {label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
