import "server-only";
import type { WorthBadge } from "./display";
import type { EvalDeal, Signals } from "./rubric";

const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const LOW_CONFIDENCE = 0.4;
const PEDIGREE_YES = 0.6;
const ON_THESIS_REVIEW = 0.45;
const ANTI_PASS = 0.7;

export function getJevApiKey(): string | null {
  const key = (
    process.env.TYPESAFE_API_KEY ||
    process.env.JEV_API_KEY ||
    ""
  ).trim();
  return key || null;
}

export function isJevConfigured(): boolean {
  return getJevApiKey() != null;
}

function getJevModel(): string {
  return (process.env.JEV_MODEL || "jev-1.13.0").trim() || "jev-1.13.0";
}

type NoulAnswer = { type: "noul"; noul: number };
type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

type JevResponse = {
  model?: string;
  answers?: Record<string, NoulAnswer | ChoiceAnswer>;
};

export type JevRating = {
  stars: number;
  worth: WorthBadge;
  summary: string;
  via: "jev";
  model: string;
};

function noulOf(answers: JevResponse["answers"], key: string): number {
  const a = answers?.[key];
  if (!a || a.type !== "noul") return 0;
  const n = Number(a.noul);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function choiceOf(
  answers: JevResponse["answers"],
  key: string,
): { choice: string; confidence: number } {
  const a = answers?.[key];
  if (!a || a.type !== "choice") return { choice: "no", confidence: 0 };
  return {
    choice: String(a.choice || "no").toLowerCase(),
    confidence: Number(a.confidence) || 0,
  };
}

export function dealStateForJev(
  deal: EvalDeal,
  signals: Signals,
  mode: "warm" | "cold",
): Record<string, unknown> {
  return {
    fund: "All In Capital — early-stage India / US inbound",
    mode,
    company: deal.companyName,
    founder: deal.founderName,
    sector: deal.sector,
    elite_school_column: deal.eliteSchool || "",
    blurb: (deal.blurb || "").slice(0, 2500),
    notes: (deal.summary || "").slice(0, 2500),
    website: deal.websiteUrl || "",
    deck: deal.deckLink ? "yes" : "no",
    linkedin: (signals.linkedinText || deal.linkedin || "").slice(0, 1500),
    regex_signals: {
      elite_hit: signals.eliteHit || "",
      on_thesis: signals.onThesis,
      anti_thesis: signals.antiThesis,
      stage_late: signals.stageLate,
    },
  };
}

const QUESTIONS = {
  explicit_pedigree: {
    type: "noul" as const,
    instructions:
      "The founder explicitly attended IIT, IIM, ISB, BITS, Harvard, Stanford, MIT, Berkeley, Oxford, Cambridge, or won an Emergent Ventures grant. Do not infer from a name, company, or a school mentioned as a customer.",
    criteria: {
      true: "School or grant is named as the founder's own credential",
      false: "No explicit founder pedigree, or the school is unrelated",
    },
  },
  on_thesis: {
    type: "noul" as const,
    instructions:
      "This company is on All In Capital's thesis: deep tech, satellite, drone, biotech, defense, semiconductor, hardware, robotics, or a real D2C/CPG consumer brand.",
    criteria: {
      true: "Clearly on-thesis",
      false: "Off-thesis or too vague to tell",
    },
  },
  anti_thesis: {
    type: "noul" as const,
    instructions:
      "This is anti-thesis for All In: HR tech, sales-enablement, martech, generic SaaS tools, Shopify agency, consulting, crypto/web3/NFT.",
    criteria: {
      true: "Clearly anti-thesis",
      false: "Not an anti-thesis category",
    },
  },
  worth: {
    type: "choice" as const,
    instructions:
      "Inbound triage for All In Capital. Default to no when there is no elite founder school. " +
      "If the founder explicitly attended a top school (IIT, IIM, ISB, BITS, Harvard, Stanford, MIT, Berkeley, Oxford, Cambridge, Emergent Ventures), always choose yes — even if the company is HR, sales-tech, martech, or otherwise anti-thesis. " +
      "Yes = explicit elite pedigree. Anti-thesis never turns this into no. " +
      "Review = strong on-thesis without pedigree (rare deck check). " +
      "No = no elite pedigree and not a rare on-thesis deck check.",
    criteria: {
      no: "Pass — no top-school founder, and not a rare on-thesis deck check.",
      review: "Human look — on-thesis without pedigree, and not anti-thesis.",
      yes: "Worth a call — explicit elite pedigree. Anti-thesis does not block this.",
    },
  },
};

/**
 * TypeSafe Jev — one round-trip, atomic questions, decision in code.
 * https://docs.typesafe.ai/introduction
 */
export async function jevRateDeal(
  deal: EvalDeal,
  signals: Signals,
  mode: "warm" | "cold",
): Promise<JevRating> {
  const apiKey = getJevApiKey();
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is not configured.");

  const res = await fetch(JEV_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: getJevModel(),
      state: dealStateForJev(deal, signals, mode),
      questions: QUESTIONS,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Jev ${res.status}: ${text.slice(0, 240)}`);
  }

  let body: JevResponse;
  try {
    body = JSON.parse(text) as JevResponse;
  } catch {
    throw new Error("Jev returned non-JSON.");
  }

  const answers = body.answers || {};
  const pedigreeNoul = noulOf(answers, "explicit_pedigree");
  const regexPedigree = signals.eliteSchool || signals.eliteColYes ? 1 : 0;
  const pedigree = Math.max(pedigreeNoul, regexPedigree);
  const onThesis = noulOf(answers, "on_thesis");
  const anti = noulOf(answers, "anti_thesis");
  const { choice, confidence } = choiceOf(answers, "worth");

  return composeJevRating({
    choice,
    confidence,
    pedigree,
    onThesis,
    anti,
    model: body.model || getJevModel(),
  });
}

function composeJevRating(input: {
  choice: string;
  confidence: number;
  pedigree: number;
  onThesis: number;
  anti: number;
  model: string;
}): JevRating {
  const { choice, confidence, pedigree, onThesis, anti, model } = input;
  const bits = [
    `worth=${choice} c=${confidence.toFixed(2)}`,
    `pedigree ${pedigree.toFixed(2)}`,
    `thesis ${onThesis.toFixed(2)}`,
    anti >= 0.4 ? `anti ${anti.toFixed(2)}` : "",
  ].filter(Boolean);
  const summaryFor = (label: string) => `Jev ${label} · ${bits.join(" · ")}`;

  // Top-school founders are never a Pass — including anti-thesis (HR, sales-tech, etc.).
  if (pedigree >= PEDIGREE_YES) {
    return {
      stars: 4,
      worth: "Yes",
      summary: summaryFor("Yes"),
      via: "jev",
      model,
    };
  }

  // Anti-thesis without pedigree → Pass.
  if (anti >= ANTI_PASS && onThesis < 0.4) {
    return {
      stars: 0,
      worth: "No",
      summary: summaryFor("Pass"),
      via: "jev",
      model,
    };
  }

  if (
    (choice === "review" || choice === "yes") &&
    onThesis >= ON_THESIS_REVIEW &&
    confidence >= LOW_CONFIDENCE
  ) {
    return {
      stars: 3,
      worth: "Review",
      summary: summaryFor("Review"),
      via: "jev",
      model,
    };
  }

  if (confidence < LOW_CONFIDENCE && onThesis >= ON_THESIS_REVIEW) {
    return {
      stars: 3,
      worth: "Review",
      summary: summaryFor("Review"),
      via: "jev",
      model,
    };
  }

  return {
    stars: 1,
    worth: "No",
    summary: summaryFor("Pass"),
    via: "jev",
    model,
  };
}
