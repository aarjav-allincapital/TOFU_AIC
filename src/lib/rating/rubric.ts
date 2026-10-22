/**
 * Ported from apps-script/Code.gs "Deal Evaluator v4" (rubric_v1_rules).
 * Rule-first: pedigree escalates, LLM only fills gray zones + call summaries.
 * Pure functions — no secrets; OpenAI lives in openai.ts / evaluate.ts (server-only).
 */

/** High-bar triage: ~90% Pass · ~5–6% Review · ~4–5% Yes (mostly pedigree). */
export const RUBRIC_VERSION = "rubric_v2_highbar";

export const ELITE_PATTERNS: RegExp[] = [
  /\biit\b/i, /\biim\b/i, /\bisb\b/i, /\bbits\b/i,
  /\bharvard\b/i, /\bstanford\b/i, /\bmit\b/i, /\bberkeley\b/i,
  /\boxford\b/i, /\bcambridge\b/i, /\bemergen(t)?\s*grant\b/i,
  /\bcaltech\b/i, /\bcmu\b/i, /\bcarnegie\s*mellon\b/i,
];

export const ANTI_THESIS: RegExp[] = [
  /\bhr\s*(tech|saas|software|platform)?\b/i, /\bhuman\s*resources\b/i,
  /\bsales\s*(tech|enablement|crm)\b/i, /\bmarketing\s*(tech|automation)\b/i,
  /\bdevtools?\b/i, /\bdeveloper\s*tools?\b/i, /\bshopify\b/i,
  /\bagency\b/i, /\bconsulting\b/i, /\bcrypto\b/i, /\bweb3\b/i, /\bnft\b/i,
];

export const ON_THESIS: RegExp[] = [
  /\bdeep\s*tech\b/i, /\bsatellite/i, /\bdrone/i, /\bbiotech/i, /\bdefense\b/i,
  /\bsemiconductor/i, /\bchip\b/i, /\bhardware\b/i,
  /\bai\s*(tutor|doctor|nutrition|tax|agent)/i,
  /\bd2c\b/i, /\bcpg\b/i, /\bconsumer\s*brand/i,
];

export type EvalDeal = {
  companyName: string;
  sector: string;
  founderName: string;
  blurb: string;
  summary: string;
  websiteUrl: string;
  deckLink: string;
  senderEmail: string;
  linkedin: string;
  eliteSchool: string;
  channel?: string;
  referrerName?: string;
};

export type Signals = {
  eliteSchool: boolean;
  eliteHit: string;
  onThesis: boolean;
  antiThesis: boolean;
  stageLate: boolean;
  hasDeck: boolean;
  hasWebsite: boolean;
  eliteColYes: boolean;
  linkedinText: string;
};

export type RuleDecision = {
  stars: number;
  via: string;
  needsLlm: boolean;
  reason: string;
};

export type RatingResult = {
  stars: number;
  emoji: string;
  worth: string;
  summary: string;
  mode: "warm" | "cold";
  via: string;
  usedLlm: boolean;
};

function capitalize(s: string): string {
  const t = String(s || "");
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function matchElite(text: string): string {
  if (!text) return "";
  for (const re of ELITE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const iitCampus = text.match(
        /\biit[\s-]*(roorkee|delhi|bombay|madras|kanpur|kharagpur|guwahati|hyderabad|indore|bhu|varanasi)\b/i,
      );
      if (iitCampus) return `IIT ${capitalize(iitCampus[1])}`;
      return m[0].toUpperCase().replace(/\s+/g, " ");
    }
  }
  return "";
}

export function determineMode(deal: EvalDeal): "warm" | "cold" {
  const email = (deal.senderEmail || "").toLowerCase();
  const ch = (deal.channel || "").toLowerCase();
  if (email.includes("superdm.com")) return "cold";
  if (/superdm|cold|founder_direct|whatsapp/.test(ch)) return "cold";
  const rn = (deal.referrerName || "").trim();
  if (rn && !/^(none|n\/a|na|unknown|-)$/i.test(rn)) return "warm";
  return "cold";
}

/** LinkedIn fetch is best-effort and optional — skipped by default (no fetch permissions
 *  needed server-side unless explicitly enabled), matching the "minimize LLM/IO" intent. */
async function fetchLinkedInText(url: string): Promise<string> {
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const res = await fetch(withProto, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AllInCapitalBot/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  } catch {
    return "";
  }
}

export async function collectSignals(deal: EvalDeal): Promise<Signals> {
  const blob = [
    deal.eliteSchool, deal.blurb, deal.summary, deal.sector,
    deal.founderName, deal.companyName,
  ].join(" ");

  let eliteHit = matchElite(blob);
  let linkedinText = "";

  // LinkedIn HTTP fetch is slow (often 3–5s) and usually blocked. Off by default;
  // set ENABLE_LINKEDIN_FETCH=1 only if you want the extra pedigree signal.
  const fetchLi = process.env.ENABLE_LINKEDIN_FETCH === "1";
  if (
    fetchLi &&
    !eliteHit &&
    deal.linkedin &&
    /linkedin\.com/i.test(deal.linkedin)
  ) {
    linkedinText = await fetchLinkedInText(deal.linkedin);
    eliteHit = matchElite(linkedinText);
  }

  const full = `${blob} ${linkedinText}`;
  return {
    eliteSchool: Boolean(eliteHit),
    eliteHit: eliteHit || "",
    onThesis: ON_THESIS.some((re) => re.test(full)),
    antiThesis: ANTI_THESIS.some((re) => re.test(full)),
    stageLate:
      /series\s*[ab]|raised\s*\$?[1-9]\d{2,}k|valuation\s*\$?\d+m|seed\s*from\s*(sequoia|a16z|accel|lightspeed)/i.test(
        full,
      ),
    hasDeck: Boolean(deal.deckLink),
    hasWebsite: Boolean(deal.websiteUrl),
    eliteColYes: /^(yes|y|true|1)$/i.test(String(deal.eliteSchool || "").trim()),
    linkedinText,
  };
}

export function ruleScore(
  deal: EvalDeal,
  s: Signals,
  mode: "warm" | "cold",
): RuleDecision {
  if (s.stageLate && !s.eliteSchool) {
    return { stars: 0, via: "stage-late", needsLlm: false, reason: "Stage too late" };
  }

  if (s.eliteColYes || s.eliteSchool) {
    let stars = 4;
    if (mode === "warm" && s.onThesis) stars = 5;
    return {
      stars,
      via: "pedigree",
      needsLlm: false,
      reason: `Elite pedigree (${s.eliteHit || "Yes"})`,
    };
  }

  if (s.antiThesis && !s.onThesis) {
    return { stars: 0, via: "anti-thesis", needsLlm: false, reason: "Anti-thesis" };
  }

  // On-thesis alone is NOT Review — default Pass; LLM only if there's
  // something to inspect (deck / LinkedIn / rich notes). Target: ~10% Review+.
  if (s.onThesis) {
    const inspectable =
      s.hasDeck ||
      Boolean(deal.linkedin?.trim()) ||
      ((deal.blurb || "") + (deal.summary || "")).length > 120;
    return {
      stars: 1,
      via: "on-thesis",
      needsLlm: inspectable,
      reason: "On thesis — deck only if team signal holds",
    };
  }

  if (!deal.blurb && !deal.summary && !deal.deckLink) {
    return { stars: 0, via: "empty", needsLlm: false, reason: "No signal" };
  }

  // Default: Pass. Do not burn LLM on every blurb — keeps Pass near ~90%.
  return {
    stars: 0,
    via: "default-pass",
    needsLlm: false,
    reason: "No clear archetype",
  };
}

export function applyFloorsCaps(
  stars: number,
  s: Signals,
  mode: "warm" | "cold",
): number {
  let out = stars;
  if (s.eliteSchool || s.eliteColYes) out = Math.max(out, 4);
  if (mode === "cold" && out > 4) out = 4;
  if (s.stageLate && !s.eliteSchool) out = Math.min(out, 1);
  return out;
}

export function starsToEmoji(n: number): string {
  if (n <= 0) return "—";
  return "⭐".repeat(n);
}

export function starsToWorth(stars: number, mode: "warm" | "cold"): string {
  if (stars <= 1) return "Pass";
  if (stars === 2) return "Likely pass";
  if (stars === 3) return mode === "cold" ? "Deck check" : "Borderline";
  if (stars === 4) return "Worth a call";
  if (stars === 5) return "Partner call";
  return "Pass";
}

export { starsToWorthBadge, resolveWorthBadge, type WorthBadge } from "./display";
