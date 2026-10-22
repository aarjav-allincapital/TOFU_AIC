import { after, NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { fetchSourcingPayload } from "@/lib/sourcing/fetch";
import {
  enrichMissingSourcingLinkedIn,
  isSourcingLinkedInEnabled,
} from "@/lib/sourcing/linkedin-enrich";
import { parseSourcingSheetId } from "@/lib/sourcing/sheet-id";
import {
  enrichMissingSourcingTracxn,
  isSourcingTracxnEnabled,
} from "@/lib/sourcing/tracxn-enrich";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const sheetId = parseSourcingSheetId(req.nextUrl.searchParams.get("sheetId"));

  try {
    const payload = await fetchSourcingPayload({ sheetId });
    if (isSourcingLinkedInEnabled() && payload.sourced.length > 0) {
      after(async () => {
        try {
          await enrichMissingSourcingLinkedIn(payload.sourced, { limit: 4 });
        } catch (err) {
          console.warn("[sourcing/linkedin] background enrich failed:", err);
        }
      });
    }
    if (isSourcingTracxnEnabled() && payload.sourced.length > 0) {
      after(async () => {
        try {
          await enrichMissingSourcingTracxn(payload.sourced, { limit: 6 });
        } catch (err) {
          console.warn("[sourcing/tracxn] background enrich failed:", err);
        }
      });
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load sourcing", detail: message },
      { status: 502 },
    );
  }
}
