import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  enrichSourcingTracxnDomain,
  isSourcingTracxnEnabled,
} from "@/lib/sourcing/tracxn-enrich";
import { tracxnDomain } from "@/lib/tracxn/domain";
import { TRACXN_VIA_LABEL } from "@/lib/tracxn/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Manual "Find on Tracxn" for a sourced founder. Spends at most 2 credits. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isSourcingTracxnEnabled()) {
    return NextResponse.json(
      { error: "Tracxn is not configured — set TRACXN_API_KEY." },
      { status: 503 },
    );
  }

  let body: { domain?: unknown; founderKey?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const domain = tracxnDomain(typeof body.domain === "string" ? body.domain : "");
  if (!domain) {
    return NextResponse.json(
      { error: "Enter the company website, e.g. acme.com." },
      { status: 400 },
    );
  }
  const founderKey =
    typeof body.founderKey === "string" && body.founderKey.trim().length <= 500
      ? body.founderKey.trim()
      : "";

  const { via, profile } = await enrichSourcingTracxnDomain(domain, {
    founderKey: founderKey || undefined,
    force: body.force === true,
  });
  if (via === "skipped") {
    return NextResponse.json({ ok: false, via, message: "Lookup already running." });
  }
  return NextResponse.json({
    ok: via === "ok",
    via,
    domain,
    profile,
    message: TRACXN_VIA_LABEL[via],
  });
}
