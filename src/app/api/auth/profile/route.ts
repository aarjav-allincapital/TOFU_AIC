import { NextRequest, NextResponse } from "next/server";
import { nameFromEmail } from "@/lib/auth/name";
import { getSession, setSessionCookie } from "@/lib/auth/session";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let name: string;
  try {
    const body = await req.json();
    name = String(body.name ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!name) {
    name = nameFromEmail(session.email);
  }

  if (name.length > 80) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  await setSessionCookie({
    email: session.email,
    name,
    onboarded: true,
  });

  return NextResponse.json({
    ok: true,
    email: session.email,
    name,
    onboarded: true,
  });
}
