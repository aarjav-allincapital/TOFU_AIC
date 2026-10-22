import { NextResponse } from "next/server";
import { after } from "next/server";
import { fetchDealsPayload } from "@/lib/deal-sources";
import {
  autoRateUnrated,
  reconcileNewDeals,
} from "@/lib/deal-sources/auto-rate";
import { getSession } from "@/lib/auth/session";
import { scopeDealsForEmail } from "@/lib/deal-owner";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** after(): rate + Attio + deck PDF extract needs headroom beyond default. */
export const maxDuration = 120;

export async function GET() {
  try {
    const payload = await fetchDealsPayload();

    // Never block the portal on OpenAI / Attio / deck PDF. Background after response.
    after(async () => {
      try {
        // Brand-new Sheet rows: insert → rate → Attio → deck summary (1★/5★).
        await reconcileNewDeals(payload);
      } catch (err) {
        console.warn("[api/deals] reconcile new deals failed:", err);
      }
      try {
        // Backlog unrated rows: rate → Attio → deck summary (1★/5★).
        await autoRateUnrated(payload);
      } catch (err) {
        console.warn("[api/deals] background auto-rate failed:", err);
      }
      // LinkedIn: scrape only brand-new Sheet rows inside reconcileNewDeals.
      // Never bulk-scrape on poll / cron / rating backlog (Bright Data cost).
    });

    // Background rating runs on the full payload above; the response is scoped
    // to the caller's inbox (Aditya sees only his dealflow).
    const session = await getSession();
    const deals = scopeDealsForEmail(payload.deals, session?.email);
    const scoped = { ...payload, deals, count: deals.length };

    return NextResponse.json(scoped, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load deals", detail: message },
      { status: 502 },
    );
  }
}
