export type ShareExperience = {
  title: string;
  company: string;
  duration: string;
  logo: string;
};

export type ShareEducation = {
  school: string;
  degree: string;
  logo: string;
};

export type ShareCardFields = {
  company: string;
  founder: string;
  blurb: string;
  website: string;
  domain: string;
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
  profileName: string;
  headline: string;
  avatar: string;
  experience: ShareExperience[];
  education: ShareEducation[];
  sharedAt: string;
};

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "tofu-aic.vercel.app",
]);

export function clipShareText(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function shareTitle(company: string, founder: string): string {
  return clipShareText(company, 80) || clipShareText(founder, 80) || "Stealth";
}

/** One public line for the card. Internal notes, scores, and dumps stay off it. */
export function shareOverview(input: {
  companyNote?: string;
  domain?: string;
  founder?: string;
  company?: string;
}): string {
  const note = clipShareText(input.companyNote || "", 180);
  if (note) return note;
  const domain = clipShareText(input.domain || "", 180);
  if (domain) return domain;
  const who = clipShareText(input.founder || "", 40) || "A founder";
  const what = clipShareText(input.company || "", 40);
  return what ? `${who} is building ${what}.` : `${who} is building something new.`;
}

/** Company site only. Drops the portal and anything that is not http(s). */
export function safePublicWebsite(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host.includes(".")) return "";
    if (
      BLOCKED_HOSTS.has(host) ||
      host.endsWith(".tofu-aic.vercel.app") ||
      host === "rocketreach.co" ||
      host.endsWith(".rocketreach.co")
    ) {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

const INLINE_IMAGE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_INLINE_IMAGE_CHARS = 400_000;

/** Either a copy of the image stored on the card, or a public http(s) URL. */
export function safeImageUrl(value: string): string {
  const raw = value.trim();
  if (raw.startsWith("data:")) {
    return raw.length <= MAX_INLINE_IMAGE_CHARS && INLINE_IMAGE.test(raw) ? raw : "";
  }
  const url = safePublicWebsite(raw);
  if (!url || url.length > 1200) return "";
  return url;
}

export function isRemoteImage(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function emptyShareProfile(): Pick<
  ShareCardFields,
  "profileName" | "headline" | "avatar" | "experience" | "education"
> {
  return {
    profileName: "",
    headline: "",
    avatar: "",
    experience: [],
    education: [],
  };
}

export function compactShareProfile(
  preview: unknown,
): Pick<ShareCardFields, "profileName" | "headline" | "avatar" | "experience" | "education"> {
  if (!preview || typeof preview !== "object") return emptyShareProfile();
  const p = preview as Record<string, unknown>;
  const profileName = clipShareText(String(p.name ?? p.profileName ?? ""), 80);
  const experience = Array.isArray(p.experience)
    ? p.experience.slice(0, 2).map((row) => {
        const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        return {
          title: clipShareText(String(item.title ?? ""), 80),
          company: clipShareText(String(item.company ?? ""), 80),
          duration: clipShareText(String(item.duration ?? ""), 80),
          logo: safeImageUrl(String(item.logo ?? "")),
        };
      }).filter((row) => row.title || row.company)
    : [];
  const education = Array.isArray(p.education)
    ? p.education.slice(0, 2).map((row) => {
        const item = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        return {
          school: clipShareText(String(item.school ?? ""), 80),
          degree: clipShareText(String(item.degree ?? ""), 80),
          logo: safeImageUrl(String(item.logo ?? "")),
        };
      }).filter((row) => row.school)
    : [];
  return {
    profileName,
    headline: clipShareText(String(p.headline ?? ""), 160),
    avatar: safeImageUrl(String(p.avatar ?? "")),
    experience,
    education,
  };
}

export function shareHost(website: string): string {
  if (!website) return "";
  try {
    return new URL(website).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function shareDetails(card: ShareCardFields): { label: string; value: string }[] {
  return [
    { label: "Domain / sector", value: card.domain },
    { label: "Time building", value: card.stageTimeline },
    { label: "Funding", value: card.funding },
    { label: "Pedigree", value: card.pedigree },
    { label: "Technical architecture", value: card.hardware },
    { label: "Engineering moat", value: card.moat },
    { label: "Target market & TAM", value: card.tam },
    { label: "Audit status", value: card.auditStatus },
    { label: "Notes", value: card.notes },
  ].filter((detail) => detail.value.trim());
}

export function shareText(card: ShareCardFields, url: string): string {
  const lines = [
    url,
    "",
    shareTitle(card.company, card.founder),
    card.profileName || (card.founder && card.company ? `With ${card.founder}` : ""),
    card.headline,
    card.blurb,
    ...shareDetails(card).map(({ label, value }) => `${label}: ${value}`),
  ];
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim();
}

export function formatShareDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}
