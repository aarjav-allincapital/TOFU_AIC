import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/allowlist";
import { nameFromEmail } from "@/lib/auth/name";
import { verifyOtp } from "@/lib/auth/otp";
import { setSessionCookie } from "@/lib/auth/session";

const REASON_MESSAGES: Record<string, string> = {
  not_found: "No code found for this email. Request a new one.",
  expired: "This code has expired. Request a new one.",
  too_many_attempts: "Too many attempts. Request a new code.",
  invalid: "Incorrect code. Please try again.",
};

export async function POST(req: NextRequest) {
  let email: string;
  let code: string;
  try {
    const body = await req.json();
    email = normalizeEmail(String(body.email ?? ""));
    code = String(body.code ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!email || !code) {
    return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
  }

  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: "Only @allincapital.vc emails can sign in." },
      { status: 403 },
    );
  }

  const result = await verifyOtp(email, code);

  if (!result.ok) {
    return NextResponse.json(
      { error: REASON_MESSAGES[result.reason] ?? "Verification failed." },
      { status: 401 },
    );
  }

  await setSessionCookie({
    email,
    name: nameFromEmail(email),
    onboarded: false,
  });

  return NextResponse.json({ ok: true });
}
