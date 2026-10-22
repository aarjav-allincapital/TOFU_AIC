import { NextResponse } from "next/server";
import { syncSheetToSupabase } from "@/lib/deal-sources";
import { rateBacklogFromSupabase } from "@/lib/deal-sources/auto-rate";
import { sendDueAutoPassRejectEmails } from "@/lib/pass-reject-email";
import { syncMissingBucketEntriesToAttio } from "@/lib/attio/inbound-sync";
import { summarizeDeckBacklog } from "@/lib/deck/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function runSync(req: Request) {
  const secret = process.env.SYNC_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const isVercelCron =
    req.headers.get("x-vercel-cron") === "1" ||
    (cronSecret != null && auth === `Bearer ${cronSecret}`);
  if (secret && !isVercelCron) {
    const provided =
      req.headers.get("x-sync-secret") ??
      new URL(req.url).searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const supabase = await syncSheetToSupabase();
    // Extra backlog pass (rules-first) so unrated rows catch up even if
    // the sheet sync batch was mostly already-rated.
    let rate = null;
    try {
      rate = await rateBacklogFromSupabase(
        Number(process.env.RATING_BATCH_LIMIT || 150),
      );
    } catch (err) {
      console.warn("[api/sync] backlog rate failed:", err);
    }

    // Catch Pass / call_* rows that missed live Attio writes.
    let attioBackfill = null;
    try {
      attioBackfill = await syncMissingBucketEntriesToAttio(
        Number(process.env.ATTIO_BACKFILL_BATCH || 80),
      );
    } catch (err) {
      console.warn("[api/sync] attio backfill failed:", err);
    }

    // PDF deck summaries for deals with a link but no deck_summarized_at yet.
    let deckSummaries = null;
    try {
      deckSummaries = await summarizeDeckBacklog(
        Number(process.env.DECK_SUMMARY_BATCH || 30),
      );
    } catch (err) {
      console.warn("[api/sync] deck summary backlog failed:", err);
    }

    // LinkedIn: NOT scraped on cron. Only brand-new Sheet rows via
    // reconcileNewDeals when the dashboard polls /api/deals.

    // Auto-pass reject emails: only after ≥24h from date received.
    let passRejects = null;
    try {
      passRejects = await sendDueAutoPassRejectEmails(
        Number(process.env.PASS_REJECT_BATCH || 80),
      );
    } catch (err) {
      console.warn("[api/sync] pass-reject batch failed:", err);
    }

    return NextResponse.json({
      ok: true,
      supabase,
      rate,
      attioBackfill,
      deckSummaries,
      passRejects,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** Manual trigger. */
export async function POST(req: Request) {
  return runSync(req);
}

/** Vercel Cron sends GET requests (daily 06:00 UTC). */
export async function GET(req: Request) {
  return runSync(req);
}
