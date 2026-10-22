import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin-core";
import { getSession } from "@/lib/auth/session";
import { isAttioConfigured } from "@/lib/attio/client";
import { rowToDeal } from "@/lib/attio/inbound-sync";
import { pushDealToDealFlow } from "@/lib/attio/deal-flow";
import {
  isDealFlowOwnerEmail,
  isDealFlowStage,
} from "@/lib/attio/deal-flow-options";

const SELECT =
  "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, owner, channel, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at";

/**
 * Manual "Add to Attio" — puts the deal's company on Deal Flow in the column
 * the teammate picked, optionally assigning an Owner. No founder email, no
 * portal bucket/stage change.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin is not configured." },
      { status: 500 },
    );
  }
  if (!isAttioConfigured()) {
    return NextResponse.json(
      { error: "Attio is not configured (ATTIO_API_KEY)." },
      { status: 500 },
    );
  }

  let body: { rowIndex?: number; stage?: string; ownerEmail?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { rowIndex, stage } = body;
  const ownerEmail = (body.ownerEmail || "").trim().toLowerCase() || null;

  if (typeof rowIndex !== "number" || !stage || !isDealFlowStage(stage)) {
    return NextResponse.json(
      { error: "Missing or invalid rowIndex/stage." },
      { status: 400 },
    );
  }
  if (ownerEmail && !isDealFlowOwnerEmail(ownerEmail)) {
    return NextResponse.json({ error: "Unknown owner." }, { status: 400 });
  }

  const admin = getSupabaseAdminCore();
  const { data: row, error } = await admin
    .from("deals")
    .select(SELECT)
    .eq("row_index", rowIndex)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }

  const deal = rowToDeal(row as Record<string, unknown>);

  try {
    const result = await pushDealToDealFlow(deal, { stage, ownerEmail });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to push to Attio.",
      },
      { status: 502 },
    );
  }
}
