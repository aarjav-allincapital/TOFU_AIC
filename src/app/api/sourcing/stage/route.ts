import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isBoardStage } from "@/lib/sourcing/board";
import { writeBoardStage } from "@/lib/sourcing/board-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { key?: unknown; stage?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key || key.length > 500 || !isBoardStage(body.stage)) {
    return NextResponse.json({ error: "Missing key or stage." }, { status: 400 });
  }

  const saved = await writeBoardStage(key, body.stage, session.email ?? null);
  if (!saved) {
    return NextResponse.json(
      {
        error:
          "Board stages are not saved yet — run supabase/migrate-sourcing-board.sql in Supabase.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, key, stage: body.stage });
}
