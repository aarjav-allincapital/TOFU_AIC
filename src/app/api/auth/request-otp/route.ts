import { NextRequest, NextResponse } from "next/server";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/allowlist";
import { issueOtp } from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/resend";

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = normalizeEmail(String(body.email ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: "Only @allincapital.vc emails can sign in." },
      { status: 403 },
    );
  }

  const result = await issueOtp(email);

  if (!result.ok) {
    return NextResponse.json(
      { error: "A code was just sent. Please wait before requesting another." },
      { status: 429 },
    );
  }

  try {
    await sendOtpEmail(email, result.code);
  } catch (err) {
    console.error("Failed to send OTP email", err);
    return NextResponse.json(
      { error: "Failed to send email. Try again shortly." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
