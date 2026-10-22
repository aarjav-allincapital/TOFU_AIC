import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  clipShareText,
  compactShareProfile,
  safePublicWebsite,
  shareOverview,
} from "@/lib/sourcing/share-card";
import { inlineShareImages } from "@/lib/sourcing/share-images";
import { writeShareCard } from "@/lib/sourcing/share-store";

export const dynamic = "force-dynamic";

function originFrom(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const host = req.headers.get("x-forwarded-host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: {
    company?: string;
    founder?: string;
    companyNote?: string;
    domain?: string;
    website?: string;
    stageTimeline?: string;
    funding?: string;
    pedigree?: string;
    hardware?: string;
    moat?: string;
    tam?: string;
    auditStatus?: string;
    linkedin?: string;
    github?: string;
    twitter?: string;
    notes?: string;
    linkedinPreview?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const company = clipShareText(String(body.company ?? ""), 80);
  const founder = clipShareText(String(body.founder ?? ""), 80);
  if (!company && !founder) {
    return NextResponse.json({ error: "This deal has no name to share." }, { status: 400 });
  }

  const sharedAt = new Date().toISOString();
  const card = await inlineShareImages({
    company,
    founder,
    blurb: shareOverview({
      companyNote: String(body.companyNote ?? ""),
      domain: String(body.domain ?? ""),
      founder,
      company,
    }),
    website: safePublicWebsite(String(body.website ?? "")),
    domain: clipShareText(String(body.domain ?? ""), 160),
    stageTimeline: clipShareText(String(body.stageTimeline ?? ""), 160),
    funding: clipShareText(String(body.funding ?? ""), 240),
    pedigree: clipShareText(String(body.pedigree ?? ""), 240),
    hardware: clipShareText(String(body.hardware ?? ""), 260),
    moat: clipShareText(String(body.moat ?? ""), 260),
    tam: clipShareText(String(body.tam ?? ""), 260),
    auditStatus: clipShareText(String(body.auditStatus ?? ""), 160),
    linkedin: safePublicWebsite(String(body.linkedin ?? "")),
    github: safePublicWebsite(String(body.github ?? "")),
    twitter: safePublicWebsite(String(body.twitter ?? "")),
    notes: clipShareText(String(body.notes ?? ""), 260),
    ...compactShareProfile(body.linkedinPreview),
    sharedAt,
  });
  const id = await writeShareCard(card);
  const url = `${originFrom(req)}/card/${id}`;

  return NextResponse.json({ url, card });
}
