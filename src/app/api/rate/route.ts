import { NextResponse } from "next/server";
import { rateBacklogFromSupabase } from "@/lib/deal-sources/auto-rate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Rate unrated / old-rubric deals from the Supabase mirror (no Sheet fetch).
 * Called by Vercel Cron so the backlog catches up without slowing the portal.
 */
async function run(req: Request) {
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
    const result = await rateBacklogFromSupabase();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
