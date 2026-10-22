import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/allowlist";
import { recordTeamInvite } from "@/lib/auth/team-roster";
import { getSession } from "@/lib/auth/session";
import { sendInviteEmail } from "@/lib/resend";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let email: string;
  try {
    const body = await req.json();
    email = normalizeEmail(String(body.email ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: "Only @allincapital.vc emails can be invited." },
      { status: 400 },
    );
  }

  try {
    const invitedBy =
      (session.name && session.name.trim()) ||
      session.email.split("@")[0] ||
      session.email;
    await sendInviteEmail(email, invitedBy);
    await recordTeamInvite(email, invitedBy);
  } catch (err) {
    console.error("Failed to send invite email", err);
    return NextResponse.json({ error: "Failed to send invite." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
