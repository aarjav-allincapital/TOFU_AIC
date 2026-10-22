/** Normalise a website / URL / bare host to the domain Tracxn filters on. */

const GENERIC_HOSTS = new Set([
  "linkedin.com",
  "github.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "youtu.be",
  "medium.com",
  "substack.com",
  "notion.site",
  "notion.so",
  "docs.google.com",
  "drive.google.com",
  "forms.gle",
  "calendly.com",
  "cal.com",
  "rocketreach.co",
  "crunchbase.com",
  "tracxn.com",
  "inc42.com",
  "yourstory.com",
  "producthunt.com",
  "apps.apple.com",
  "play.google.com",
  "tofu-aic.vercel.app",
  // Press coverage — the URL is about the company, not the company's site.
  "livemint.com",
  "latestly.com",
  "economictimes.com",
  "economictimes.indiatimes.com",
  "indiatimes.com",
  "timesofindia.com",
  "thehindu.com",
  "hindustantimes.com",
  "business-standard.com",
  "moneycontrol.com",
  "entrackr.com",
  "techcrunch.com",
  "forbes.com",
  "bloomberg.com",
  "reuters.com",
  "theprint.in",
  "ndtv.com",
  "news18.com",
  "financialexpress.com",
  "vccircle.com",
  "theken.com",
  "the-ken.com",
  "wikipedia.org",
  "angel.co",
  "wellfound.com",
  "f6s.com",
  "pitchbook.com",
  "cbinsights.com",
]);

// Hosted personal / project pages — never a company record on Tracxn.
const HOSTED_SUFFIXES = [
  ".github.io",
  ".vercel.app",
  ".netlify.app",
  ".pages.dev",
  ".webflow.io",
  ".framer.website",
  ".framer.app",
  ".carrd.co",
  ".notion.site",
  ".super.site",
  ".wixsite.com",
  ".squarespace.com",
];

export function tracxnDomain(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    let host = url.hostname.toLowerCase().replace(/\.$/, "");
    host = host.replace(/^www\./, "");
    if (!host.includes(".") || host.length > 253) return "";
    if (/^[\d.]+$/.test(host) || host === "localhost") return "";
    const root = host.split(".").slice(-2).join(".");
    if (GENERIC_HOSTS.has(host) || GENERIC_HOSTS.has(root)) return "";
    if (HOSTED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "";
    return host;
  } catch {
    return "";
  }
}
