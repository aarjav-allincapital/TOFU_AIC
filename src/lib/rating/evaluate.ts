import "server-only";
import type { Deal } from "@/lib/types";
import { callOpenAI } from "./openai";
import {
  applyFloorsCaps,
  collectSignals,
  determineMode,
  ruleScore,
  starsToEmoji,
  starsToWorth,
  starsToWorthBadge,
  RUBRIC_VERSION,
  type EvalDeal,
  type RatingResult,
  type Signals,
} from "./rubric";
import type { WorthBadge } from "./display";

export type { WorthBadge };

export function dealToEvalDeal(deal: Deal): EvalDeal {
  return {
    companyName: deal.company,
    sector: deal.sector,
    founderName: deal.name,
    blurb: deal.blurb,
    summary: deal.summary,
    websiteUrl: deal.website,
    deckLink: deal.deckLink,
    senderEmail: deal.senderEmail,
    linkedin: deal.linkedin,
    eliteSchool: deal.eliteSchool,
  };
}

/** OpenAI: return star_rating 0–5 + worth yes|review|no. */
async function llmRateWorth(
  deal: EvalDeal,
  signals: Signals,
  mode: "warm" | "cold",
  floorStars: number,
): Promise<{ stars: number; worthHint: WorthBadge | null }> {
  const packet = [
    `Company: ${deal.companyName}`,
    `Sector: ${deal.sector}`,
    `Founder: ${deal.founderName}`,
    `School col: ${deal.eliteSchool}`,
    `Blurb: ${deal.blurb}`,
    `Notes: ${deal.summary}`,
    signals.linkedinText ? `LinkedIn: ${signals.linkedinText.slice(0, 1500)}` : "",
    `Signals: elite=${signals.eliteSchool} onThesis=${signals.onThesis} anti=${signals.antiThesis}`,
  ].join("\n");

  const prompt =
    `All In Capital inbound triage. Mode=${mode}.\n` +
    `HARD TARGET MIX: ~90% no (Pass), ~5–6% review, ~4–5% yes (Worth a call).\n` +
    `Default to no. Be stingy with review. Be extremely stingy with yes.\n` +
    `Decide star_rating (0-5) AND worth ("yes"|"review"|"no"):\n` +
    `- yes (stars 4-5): ONLY when elite pedigree is EXPLICITLY present ` +
    `(IIT/IIM/ISB/BITS/Harvard/Stanford/MIT/Berkeley/Oxford/Cambridge/Emergent Ventures). ` +
    `No pedigree → never yes.\n` +
    `- review (stars 3): Rare deck check — strong on-thesis + credible team/deck signal, still not pedigree. ` +
    `Most on-thesis deals should still be no.\n` +
    `- no (stars 0-1): Everything else. When unsure → no.\n` +
    `Never invent pedigree. JSON: {"star_rating":0,"worth":"no","elite_found":"","reason":""}\n\n${packet}`;

  try {
    const raw = await callOpenAI(prompt);
    let stars = Math.round(Number(raw.star_rating) || 0);
    if (raw.elite_found && String(raw.elite_found).trim()) stars = Math.max(stars, 4);
    stars = Math.max(stars, floorStars || 0);

    const w = String(raw.worth || "").toLowerCase().trim();
    let worthHint: WorthBadge | null = null;
    if (w === "yes") worthHint = "Yes";
    else if (w === "review") worthHint = "Review";
    else if (w === "no") worthHint = "No";

    return { stars, worthHint };
  } catch {
    return { stars: floorStars || 1, worthHint: null };
  }
}

async function llmSummary(
  badge: WorthBadge,
  deal: EvalDeal,
  signals: Signals,
): Promise<string> {
  const prompt =
    `One sentence (max 18 words) why ${deal.companyName} is Worth?=${badge}. ` +
    `Cite school/team/thesis. JSON: {"summary":"..."}\n` +
    `Founder: ${deal.founderName} School: ${signals.eliteHit || deal.eliteSchool} ` +
    `Blurb: ${(deal.blurb || "").slice(0, 300)}`;
  try {
    const raw = await callOpenAI(prompt);
    return String(raw.summary || "").trim();
  } catch {
    return "";
  }
}

/**
 * Rule-first high-bar rubric (~90% Pass · ~5–6% Review · ~4–5% Yes).
 * This is the AI rating column (rules + OpenAI). Jev is a parallel column
 * written only by /api/jev — it never replaces ai_* and never auto-passes.
 */
export async function evaluateDeal(deal: Deal): Promise<RatingResult> {
  const evalDeal = dealToEvalDeal(deal);
  if (!evalDeal.companyName.trim()) {
    return {
      stars: 0,
      emoji: "—",
      worth: "No",
      summary: "",
      mode: "cold",
      via: `empty-company@${RUBRIC_VERSION}`,
      usedLlm: false,
    };
  }

  const mode = determineMode(evalDeal);
  const signals = await collectSignals(evalDeal);
  const decision = ruleScore(evalDeal, signals, mode);

  let usedLlm = false;
  let stars = decision.stars;
  let via = decision.via;
  let worthHint: WorthBadge | null = null;

  // LLM only for explicit gray zones from rules — not every rich blurb.
  if (decision.needsLlm) {
    usedLlm = true;
    const llm = await llmRateWorth(evalDeal, signals, mode, decision.stars);
    stars = signals.eliteSchool ? Math.max(llm.stars, 4) : llm.stars;
    worthHint = llm.worthHint;
    via = "gray+llm";
  }

  stars = applyFloorsCaps(stars, signals, mode);

  const hasPedigree = signals.eliteSchool || signals.eliteColYes;

  // Pedigree → Yes. This is the intended ~4–5% "Worth a call" bucket.
  if (hasPedigree) {
    stars = Math.max(stars, 4);
  }

  let worth = starsToWorthBadge(stars);

  if (!hasPedigree) {
    // Without pedigree, Yes is forbidden — LLM can only Pass or Review.
    if (worthHint === "Review" && signals.onThesis) {
      worth = "Review";
      stars = 3;
    } else {
      worth = "No";
      stars = Math.min(stars, 1);
    }
  } else {
    worth = "Yes";
  }

  via = `${via}@${RUBRIC_VERSION}`;

  const detail = starsToWorth(stars, mode);
  const emoji = starsToEmoji(stars);

  let summary = "";
  if (worth === "Yes") {
    if (signals.eliteSchool) {
      summary =
        `Pedigree: ${signals.eliteHit}` +
        (signals.onThesis ? " · on-thesis" : " · escalate") +
        (evalDeal.deckLink ? " · review deck" : "");
    } else {
      usedLlm = true;
      summary = (await llmSummary(worth, evalDeal, signals)) || decision.reason || detail;
    }
  } else if (worth === "Review") {
    summary = decision.reason || detail;
  }

  return {
    stars,
    emoji,
    worth,
    summary: summary || `${detail}${decision.reason ? ` · ${decision.reason}` : ""}`,
    mode,
    via,
    usedLlm,
  };
}

export { RUBRIC_VERSION };
export { starsToWorthBadge, resolveWorthBadge } from "./display";
