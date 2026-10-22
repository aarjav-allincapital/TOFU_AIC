import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isAttioConfigured } from "@/lib/attio/client";
import { pushDealToDealFlow } from "@/lib/attio/deal-flow";
import {
  isDealFlowOwnerEmail,
  isDealFlowStage,
} from "@/lib/attio/deal-flow-options";
import { EMPTY_JEV_FIELDS } from "@/lib/rating/jev-fields";
import type { Deal } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Manual "Add to Attio" for a sourced founder. Same Deal Flow write as inbound:
 * company upsert, then the column and owner the teammate picked. No email.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isAttioConfigured()) {
    return NextResponse.json(
      { error: "Attio is not configured (ATTIO_API_KEY)." },
      { status: 500 },
    );
  }

  let body: {
    stage?: string;
    ownerEmail?: string | null;
    rowIndex?: number;
    founder?: string;
    company?: string;
    website?: string;
    linkedin?: string;
    companyNote?: string;
    pedigree?: string;
    funding?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const stage = body.stage || "";
  const ownerEmail = (body.ownerEmail || "").trim().toLowerCase() || null;
  const company = (body.company || "").trim();
  const founder = (body.founder || "").trim();

  if (!stage || !isDealFlowStage(stage)) {
    return NextResponse.json({ error: "Missing or invalid stage." }, { status: 400 });
  }
  if (ownerEmail && !isDealFlowOwnerEmail(ownerEmail)) {
    return NextResponse.json({ error: "Unknown owner." }, { status: 400 });
  }
  if (!company && !founder) {
    return NextResponse.json(
      { error: "This lead has no company or founder name." },
      { status: 400 },
    );
  }

  const summary = [body.pedigree, body.funding, body.notes]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
  const linkedin = (body.linkedin || "").trim();

  const deal: Deal = {
    id: `sourcing-${body.rowIndex ?? "lead"}`,
    rowIndex: typeof body.rowIndex === "number" ? body.rowIndex : 0,
    dateReceived: null,
    dateReceivedMs: null,
    name: founder,
    company: company || founder,
    sector: "",
    website: (body.website || "").trim(),
    deckLink: "",
    blurb: (body.companyNote || "").trim(),
    summary: [summary, linkedin].filter(Boolean).join("\n\n"),
    senderEmail: "",
    threadId: "",
    action: "",
    actionDate: null,
    status: "",
    linkedin,
    eliteSchool: "",
    rating: "",
    worth: "",
    owner: "",
    channel: "sourcing",
    aiRatingStars: null,
    aiWorth: null,
    aiSummary: null,
    aiVia: null,
    aiMode: null,
    aiRatedAt: null,
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

  try {
    const result = await pushDealToDealFlow(deal, { stage, ownerEmail });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to push to Attio.",
      },
      { status: 502 },
    );
  }
}
