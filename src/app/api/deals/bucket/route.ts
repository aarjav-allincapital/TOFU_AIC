import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminCore, isSupabaseAdminConfigured } from "@/lib/supabase-admin-core";
import { getSession } from "@/lib/auth/session";
import { BUCKET_OPTIONS, type BucketValue, type Deal } from "@/lib/types";
import { EMPTY_JEV_FIELDS } from "@/lib/rating/jev-fields";
import { isCallBucket, TEAM_MEMBERS } from "@/lib/bucket-config";
import { sendCallBriefEmail, sendCallInviteEmail } from "@/lib/resend";
import { fetchDeckPdf } from "@/lib/deck/fetch";
import { isAttioConfigured } from "@/lib/attio/client";
import {
  ATTIO_STAGE_PASSES,
  syncAttioOnCallAction,
  upsertDealToInbound,
} from "@/lib/attio/inbound-sync";

const VALID_BUCKETS = new Set(BUCKET_OPTIONS.map((b) => b.value));

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

  let body: {
    rowIndex?: number;
    bucket?: string;
    founderEmail?: string;
    founderName?: string;
    haveMet?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { rowIndex, bucket, founderEmail, founderName, haveMet } = body;
  if (typeof rowIndex !== "number" || !bucket || !VALID_BUCKETS.has(bucket as BucketValue)) {
    return NextResponse.json({ error: "Missing or invalid rowIndex/bucket." }, { status: 400 });
  }

  const admin = getSupabaseAdminCore();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const isPassBucket = bucket === "pass" || bucket === "pass_by_aditya";
  const isTemporaryPass = bucket === "pass_temporary";

  // Portal stage follows the bucket: Pass → Passed, call_* → Meeting, Request Info → Requested.
  const stagePatch = isPassBucket || isTemporaryPass
    ? {
        status: "Pass",
        action: isTemporaryPass
          ? haveMet
            ? "Have met"
            : "Pass (temporary)"
          : "Pass",
        action_date: today,
      }
    : bucket === "request_info"
      ? { status: "Requested", action: "Request Info", action_date: today }
      : {
          status: "Meeting",
          action:
            BUCKET_OPTIONS.find((b) => b.value === bucket)?.label ?? "Meeting",
          action_date: today,
        };

  const { error: updateError } = await admin
    .from("deals")
    .update({
      manual_bucket: bucket,
      manual_bucket_at: now,
      manual_bucket_by:
        isTemporaryPass && haveMet
          ? `${session.email}|have-met`
          : session.email,
      ...stagePatch,
    })
    .eq("row_index", rowIndex);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to save bucket: ${updateError.message}` },
      { status: 500 },
    );
  }

  let emailSent = false;
  let emailError: string | null = null;
  let briefSent = false;
  let briefError: string | null = null;
  let attioStage: string | null = null;
  let attioError: string | null = null;

  // Load deal for Attio / email context.
  const { data: row } = await admin
    .from("deals")
    .select(
      "row_index, date_received, date_received_ms, name, company, sector, website, deck_link, blurb, summary, sender_email, thread_id, action, action_date, status, linkedin, elite_school, rating, worth, ai_rating_stars, ai_worth, ai_summary, ai_via, ai_mode, ai_rated_at, manual_bucket, manual_bucket_at, manual_bucket_by, crm_entry_id, crm_synced_at, deck_summary, info_reply_note, linkedin_work_history, linkedin_college",
    )
    .eq("row_index", rowIndex)
    .maybeSingle();

  const deal: Deal | null = row
    ? {
        id: `row-${row.row_index}`,
        rowIndex: row.row_index as number,
        dateReceived: row.date_received,
        dateReceivedMs: row.date_received_ms,
        name: row.name ?? "",
        company: row.company ?? "",
        sector: row.sector ?? "",
        website: row.website ?? "",
        deckLink: row.deck_link ?? "",
        blurb: row.blurb ?? "",
        summary: row.summary ?? "",
        senderEmail: row.sender_email ?? founderEmail ?? "",
        threadId: row.thread_id ?? "",
        action: stagePatch.action,
        actionDate: stagePatch.action_date,
        status: stagePatch.status,
        linkedin: row.linkedin ?? "",
        eliteSchool: row.elite_school ?? "",
        rating: row.rating ?? "",
        worth: row.worth ?? "",
        owner: "",
        channel: "",
        aiRatingStars: row.ai_rating_stars ?? null,
        aiWorth: row.ai_worth ?? null,
        aiSummary: row.ai_summary ?? null,
        aiVia: row.ai_via ?? null,
        aiMode: row.ai_mode ?? null,
        aiRatedAt: row.ai_rated_at ?? null,
        manualBucket: bucket,
        manualBucketAt: now,
        manualBucketBy:
          isTemporaryPass && haveMet
            ? `${session.email}|have-met`
            : session.email,
        crmEntryId: row.crm_entry_id ?? null,
        crmSyncedAt: row.crm_synced_at ?? null,
        deckSummary: row.deck_summary ?? null,
        deckTextExcerpt: null,
        deckSummarizedAt: null,
        deckSummaryVia: null,
        linkedinWorkHistory: row.linkedin_work_history ?? null,
        linkedinCollege: row.linkedin_college ?? null,
        linkedinEnrichedAt: null,
        linkedinEnrichVia: null,
        infoReplyNote: row.info_reply_note ?? null,
        ...EMPTY_JEV_FIELDS,
      }
    : null;

  // Call buckets → Attio Human Review + Sent to = teammate (only path into HR).
  if (isCallBucket(bucket) && deal && isAttioConfigured()) {
    const member = TEAM_MEMBERS[bucket];
    try {
      const moved = await syncAttioOnCallAction(
        deal,
        member.fullName || member.displayName,
      );
      attioStage = moved.stage;
      await admin
        .from("deals")
        .update({
          crm_entry_id: moved.entryId,
          crm_synced_at: now,
        })
        .eq("row_index", rowIndex);
    } catch (err) {
      attioError = err instanceof Error ? err.message : "Attio sync failed.";
    }
  } else if (isPassBucket && deal && isAttioConfigured()) {
    try {
      const r = await upsertDealToInbound(deal, { stage: ATTIO_STAGE_PASSES });
      attioStage = ATTIO_STAGE_PASSES;
      await admin
        .from("deals")
        .update({
          crm_entry_id: r.entryId,
          crm_synced_at: now,
        })
        .eq("row_index", rowIndex);
    } catch (err) {
      attioError = err instanceof Error ? err.message : "Attio sync failed.";
    }
  }

  // Human Pass = force override: email now (skip 24h auto-pass wait / re-send).
  // Call invites only on call_* picks.
  if (bucket === "pass" && deal) {
    try {
      const { sendPassRejectIfNeeded } = await import(
        "@/lib/pass-reject-email"
      );
      const reject = await sendPassRejectIfNeeded({
        rowIndex,
        founderEmail: founderEmail || deal.senderEmail,
        founderName: founderName || deal.name,
        force: true,
      });
      if (reject.sent) {
        emailSent = true;
      } else if (reject.reason && reject.reason !== "already_sent" && reject.reason !== "blocked") {
        emailError =
          reject.reason === "no_email"
            ? "No founder email on file — marked Pass but no email was sent."
            : reject.reason;
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Failed to send email.";
    }
  } else if (bucket === "pass_by_aditya" && deal) {
    const email = (founderEmail || deal.senderEmail || "").trim();
    if (!email || !email.includes("@")) {
      emailError =
        "No founder email on file — marked Pass but no email was sent.";
    } else {
      try {
        const { sendPassRejectEmailFromAditya } = await import(
          "@/lib/resend"
        );
        await sendPassRejectEmailFromAditya({
          founderEmail: email,
          founderName: founderName || deal.name || "",
        });
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : "Failed to send email.";
      }
    }
  } else if (bucket === "request_info" && deal) {
    const email = (founderEmail || deal.senderEmail || "").trim();
    if (!email || !email.includes("@")) {
      emailError =
        "No founder email on file — marked Request Info but no email was sent.";
    } else {
      try {
        const { sendRequestInfoEmail } = await import("@/lib/resend");
        await sendRequestInfoEmail({
          founderEmail: email,
          founderName: founderName || deal.name || "",
        });
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : "Failed to send email.";
      }
    }
  } else if (isCallBucket(bucket)) {
    const email = (founderEmail || deal?.senderEmail || "").trim();
    const member = TEAM_MEMBERS[bucket];
    if (!member.calendlyUrl) {
      emailError =
        "No calendar link configured for this teammate — bucket saved but no email was sent.";
    } else if (!email || !email.includes("@")) {
      emailError =
        "No founder email on file — bucket saved but no email was sent.";
    } else {
      try {
        await sendCallInviteEmail({
          founderEmail: email,
          founderName: founderName || deal?.name || "",
          teamMemberName: member.fullName || member.displayName,
          calendlyUrl: member.calendlyUrl,
          ccEmail: member.email,
          linkedinUrl: member.linkedinUrl,
          signoff: bucket === "call_with_aditya1" ? "aditya" : "team",
        });
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : "Failed to send email.";
      }
    }

    const teammate = (member.email || "").trim().toLowerCase();
    if (teammate.includes("@")) {
      try {
        const deckLink = deal?.deckLink || "";
        let deckAttachment: { filename: string; content: Buffer } | undefined;
        if (deckLink.trim()) {
          const fetched = await fetchDeckPdf(deckLink);
          if (fetched.ok && fetched.bytes.byteLength > 0) {
            const safe =
              (deal?.company || deal?.name || "deck")
                .replace(/[^\w.-]+/g, "-")
                .replace(/-+/g, "-")
                .slice(0, 60) || "deck";
            deckAttachment = {
              filename: `${safe}.pdf`,
              content: Buffer.from(fetched.bytes),
            };
          }
        }
        await sendCallBriefEmail({
          toEmail: teammate,
          teamMemberName: member.fullName || member.displayName,
          founderName: founderName || deal?.name || "",
          founderEmail: email,
          company: deal?.company || "",
          sector: deal?.sector || "",
          website: deal?.website || "",
          linkedin: deal?.linkedin || "",
          eliteSchool: deal?.eliteSchool || "",
          blurb: deal?.blurb || "",
          summary: deal?.summary || "",
          aiSummary: deal?.aiSummary || "",
          aiStars: deal?.aiRatingStars ?? null,
          deckSummary: deal?.deckSummary || "",
          deckLink,
          infoReplyNote: deal?.infoReplyNote || "",
          linkedinWorkHistory: deal?.linkedinWorkHistory ?? null,
          linkedinCollege: deal?.linkedinCollege ?? null,
          deckAttachment,
        });
        briefSent = true;
      } catch (err) {
        briefError =
          err instanceof Error ? err.message : "Failed to send the call brief.";
      }
    } else {
      briefError = "No teammate email on this bucket — call brief was not sent.";
    }
  }

  return NextResponse.json({
    ok: true,
    emailSent,
    emailError,
    briefSent,
    briefError,
    attioStage,
    attioError,
    status: stagePatch.status,
    action: stagePatch.action,
    actionDate: stagePatch.action_date,
  });
}
