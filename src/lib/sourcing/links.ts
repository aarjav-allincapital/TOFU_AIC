import { normalizeLinkedInProfileUrl } from "@/lib/linkedin/url";

export type FounderLinks = {
  linkedin: string;
  github: string;
  website: string;
  twitter: string;
};

const URL_RE = /https?:\/\/[^\s,)|<>"'\]\[]+/gi;

function stripTrail(url: string): string {
  return url.replace(/[),.;]+$/g, "").trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Pull LinkedIn / GitHub / X / website URLs out of a free-text cell. */
export function extractFounderLinks(...parts: Array<string | null | undefined>): FounderLinks {
  const blob = parts.filter(Boolean).join(" \n ");
  const found = blob.match(URL_RE) || [];
  const urls = found.map(stripTrail).filter(Boolean);

  let linkedin = "";
  let github = "";
  let twitter = "";
  let website = "";

  for (const url of urls) {
    const host = hostOf(url);
    if (!host) continue;
    if (!linkedin && host.includes("linkedin.com")) {
      linkedin = normalizeLinkedInProfileUrl(url) || url;
      continue;
    }
    if (!github && host.includes("github.com")) {
      github = url;
      continue;
    }
    if (!twitter && (host === "x.com" || host === "twitter.com")) {
      twitter = url;
      continue;
    }
    if (
      !website &&
      !host.includes("linkedin.com") &&
      !host.includes("github.com") &&
      host !== "x.com" &&
      host !== "twitter.com"
    ) {
      website = url;
    }
  }

  if (!linkedin) {
    const bare = blob.match(/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%.]+/i);
    linkedin = (bare && normalizeLinkedInProfileUrl(bare[0])) || "";
  }
  if (!twitter) {
    const bare = blob.match(/(?:^|[\s(])((?:x|twitter)\.com\/[A-Za-z0-9_]+)/i);
    if (bare) twitter = `https://${bare[1]}`;
  }

  return { linkedin, github, website, twitter };
}

export function prettyLinkHost(url: string): string {
  const host = hostOf(url);
  if (!host) return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return host;
}
