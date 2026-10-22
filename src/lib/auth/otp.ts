import "server-only";
import { createHash, randomInt } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds between sends
const MAX_ATTEMPTS = 5;

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type IssueOtpResult =
  | { ok: true; code: string }
  | { ok: false; reason: "cooldown"; retryInMs: number };

/** Creates and stores a fresh OTP for the given email, unless one was just sent. */
export async function issueOtp(email: string): Promise<IssueOtpResult> {
  const db = getSupabaseAdmin();

  const { data: recent } = await db
    .from("login_otp_codes")
    .select("created_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    const elapsed = Date.now() - new Date(recent.created_at).getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", retryInMs: RESEND_COOLDOWN_MS - elapsed };
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error } = await db.from("login_otp_codes").insert({
    email,
    code_hash: hashCode(email, code),
    expires_at: expiresAt,
  });

  if (error) throw error;

  return { ok: true, code };
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "invalid" };

export async function verifyOtp(
  email: string,
  code: string,
): Promise<VerifyOtpResult> {
  const db = getSupabaseAdmin();

  const { data: row } = await db
    .from("login_otp_codes")
    .select("id, code_hash, attempts, consumed, expires_at")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || row.consumed) {
    return { ok: false, reason: "not_found" };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = row.code_hash === hashCode(email, code);

  if (!matches) {
    await db
      .from("login_otp_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return { ok: false, reason: "invalid" };
  }

  await db
    .from("login_otp_codes")
    .update({ consumed: true })
    .eq("id", row.id);

  return { ok: true };
}
