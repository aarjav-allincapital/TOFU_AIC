import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isLocalLab } from "@/lib/local-lab";
import type { Deal } from "@/lib/types";
import { dealToEvalDeal, evaluateDeal } from "@/lib/rating/evaluate";
import { isJevConfigured, jevRateDeal } from "@/lib/rating/jev";
import { collectSignals, determineMode, RUBRIC_VERSION } from "@/lib/rating/rubric";
import { persistAiRatingOnly, persistJevRating } from "@/lib/rating/persist-jev";
import { EMPTY_JEV_FIELDS } from "@/lib/rating/jev-fields";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isJevVia(via: string | null | undefined): boolean {
  return (via || "").toLowerCase().includes("jev");
}

export async function GET() {
  if (!isLocalLab()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({
    configured: isJevConfigured(),
    localButton: true,
  });
}

export async function POST(req: Request) {
  if (!isLocalLab()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isJevConfigured()) {
    return NextResponse.json(
      { error: "TYPESAFE_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let body: Partial<Deal> & { rowIndex?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const rowIndex = Number(body.rowIndex);
  if (!Number.isFinite(rowIndex) || rowIndex <= 0) {
    return NextResponse.json({ error: "Missing rowIndex." }, { status: 400 });
  }

  const deal: Deal = {
    id: `row-${rowIndex}`,
    rowIndex,
    dateReceived: null,
    dateReceivedMs: null,
    name: String(body.name || ""),
    company: String(body.company || ""),
    sector: String(body.sector || ""),
    website: String(body.website || ""),
    deckLink: String(body.deckLink || ""),
    blurb: String(body.blurb || ""),
    summary: String(body.summary || ""),
    senderEmail: String(body.senderEmail || ""),
    threadId: "",
    action: "",
    actionDate: null,
    status: "",
    linkedin: String(body.linkedin || ""),
    eliteSchool: String(body.eliteSchool || ""),
    rating: "",
    worth: String(body.worth || ""),
    owner: "",
    channel: "",
    aiRatingStars: body.aiRatingStars ?? null,
    aiWorth: body.aiWorth ?? null,
    aiSummary: body.aiSummary ?? null,
    aiVia: body.aiVia ?? null,
    aiMode: body.aiMode ?? null,
    aiRatedAt: body.aiRatedAt ?? null,
    ...EMPTY_JEV_FIELDS,
    manualBucket: null,
    manualBucketAt: null,
    manualBucketBy: null,
    crmEntryId: null,
    crmSyncedAt: null,
    deckSummary: null,
    deckTextExcerpt: null,
    deckSummarizedAt: null,
    deckSummaryVia: null,
    linkedinWorkHistory: null,
    linkedinCollege: null,
    linkedinEnrichedAt: null,
    linkedinEnrichVia: null,
  };

  if (!deal.company.trim()) {
    return NextResponse.json({ ok: false, reason: "empty-company" });
  }

  const evalDeal = dealToEvalDeal(deal);
  const mode = determineMode(evalDeal);
  const signals = await collectSignals(evalDeal);
  const jev = await jevRateDeal(evalDeal, signals, mode);
  const via = `${jev.via}@${RUBRIC_VERSION}`;
  const ratedAt = new Date().toISOString();

  await persistJevRating(rowIndex, {
    stars: jev.stars,
    worth: jev.worth,
    summary: jev.summary,
    via,
    ratedAt,
  });

  const patch: Partial<Deal> = {
    jevRatingStars: jev.stars,
    jevWorth: jev.worth,
    jevSummary: jev.summary,
    jevVia: via,
    jevRatedAt: ratedAt,
  };

  // If Jev previously overwrote the AI column, restore AI with rules+OpenAI
  // so the two columns can actually be compared.
  if (isJevVia(deal.aiVia)) {
    try {
      const ai = await evaluateDeal(deal);
      await persistAiRatingOnly(rowIndex, {
        stars: ai.stars,
        worth: ai.worth,
        summary: ai.summary,
        via: ai.via,
        mode: ai.mode,
      });
      patch.aiRatingStars = ai.stars;
      patch.aiWorth = ai.worth;
      patch.aiSummary = ai.summary;
      patch.aiVia = ai.via;
      patch.aiMode = ai.mode;
      patch.aiRatedAt = new Date().toISOString();
    } catch (err) {
      console.warn(
        "[jev] AI restore failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({ ok: true, rowIndex, patch });
}
