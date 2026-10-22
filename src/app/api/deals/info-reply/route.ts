import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseAdminCore,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin-core";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type DealRow = {
  row_index: number;
  sender_email: string | null;
  deck_link: string | null;
  manual_bucket: string | null;
  info_replied_at: string | null;
  info_reply_note: string | null;
};

function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[).,;]+$/, "") : null;
}

function authorized(req: NextRequest, sessionEmail: string | null): boolean {
  if (sessionEmail) return true;
  const secret = (process.env.SYNC_SECRET || "").trim();
  if (!secret) return false;
  const provided = (
    req.headers.get("x-sync-secret") ??
    new URL(req.url).searchParams.get("secret") ??
    ""
  ).trim();
  return provided === secret;
}

function isReplyTarget(row: DealRow): boolean {
  const bucket = String(row.manual_bucket || "")
    .trim()
    .toLowerCase();
  return bucket === "request_info" || Boolean(row.info_replied_at);
}

function emailOf(row: DealRow): string {
  return String(row.sender_email || "")
    .trim()
    .toLowerCase();
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!authorized(req, session?.email ?? null)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(
      { error: "Supabase admin is not configured." },
      { status: 500 },
    );
  }

  let body: {
    senderEmail?: string;
    rowIndex?: number;
    subject?: string;
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const senderEmail = String(body.senderEmail || "")
    .trim()
    .toLowerCase();
  const rowIndex =
    typeof body.rowIndex === "number" && Number.isFinite(body.rowIndex)
      ? body.rowIndex
      : Number.isFinite(Number(body.rowIndex)) && Number(body.rowIndex) > 0
        ? Number(body.rowIndex)
        : null;
  const note = [
    body.subject ? `Subject: ${String(body.subject).trim()}` : "",
    String(body.note || "").trim(),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);

  if (!rowIndex && !senderEmail.includes("@")) {
    return NextResponse.json({ ok: false, reason: "no_sender" });
  }

  const admin = getSupabaseAdminCore();
  const selectCols =
    "row_index, sender_email, deck_link, manual_bucket, info_replied_at, info_reply_note";

  let match: DealRow | undefined;
  let wrongBucket: string | null = null;

  if (rowIndex != null) {
    const { data, error } = await admin
      .from("deals")
      .select(selectCols)
      .eq("row_index", rowIndex)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) {
      if (isReplyTarget(data as DealRow)) match = data as DealRow;
      else {
        wrongBucket = String((data as DealRow).manual_bucket || "") || "none";
      }
    }
  }

  if (!match && senderEmail.includes("@")) {
    const { data, error } = await admin
      .from("deals")
      .select(selectCols)
      .or("manual_bucket.eq.request_info,info_replied_at.not.is.null")
      .order("date_received_ms", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    match = ((data || []) as DealRow[]).find((r) => emailOf(r) === senderEmail);
  }

  if (!match) {
    return NextResponse.json({
      ok: false,
      reason: wrongBucket ? "not_request_info" : "not_found",
      bucket: wrongBucket,
      rowIndex,
      senderEmail: senderEmail || null,
    });
  }

  const now = new Date().toISOString();
  const deckFromNote = firstUrl(note);
  const previous = String(match.info_reply_note || "").trim();
  const noteCore = String(body.note || "").trim();
  const alreadyHas =
    Boolean(previous) &&
    (previous === note ||
      (noteCore.length > 40 && previous.includes(noteCore.slice(0, 80))));

  const previousAt = match.info_replied_at
    ? new Date(match.info_replied_at).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : "";
  const combined = alreadyHas
    ? previous
    : previous && previous !== note
      ? `${note}\n\n––– Earlier reply${previousAt ? ` (${previousAt})` : ""} –––\n${previous}`.slice(
          0,
          8000,
        )
      : note;

  const patch: Record<string, string> = {
    info_replied_at: now,
    info_reply_note: combined,
    status: "Replied",
    action: "Reply received",
  };
  if (deckFromNote && !String(match.deck_link || "").trim()) {
    patch.deck_link = deckFromNote;
  }

  const { error: updateError } = await admin
    .from("deals")
    .update(patch)
    .eq("row_index", match.row_index);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    rowIndex: match.row_index,
    infoRepliedAt: now,
    duplicate: alreadyHas,
  });
}
