import { NextResponse } from "next/server";
import { nameFromEmail } from "@/lib/auth/name";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { email: null, name: null, onboarded: false },
      { status: 200 },
    );
  }

  const name = session.name?.trim() || nameFromEmail(session.email);

  return NextResponse.json({
    email: session.email,
    name,
    onboarded: session.onboarded === true,
  });
}
