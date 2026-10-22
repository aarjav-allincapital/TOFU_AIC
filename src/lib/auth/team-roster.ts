import "server-only";
import { createHash } from "crypto";
import { nameFromEmail } from "@/lib/auth/name";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type TeamMemberRole = "admin" | "member" | "invited";

export type TeamRosterMember = {
  email: string;
  name: string;
  role: TeamMemberRole;
  invitedAt?: string;
  joinedAt?: string;
};

/** Prefer human names for known teammates over email local-parts. */
const DISPLAY_NAMES: Record<string, string> = {
  "aarjav@allincapital.vc": "Aarjav",
  "disha@allincapital.vc": "Disha",
  "kushal@allincapital.vc": "Kushal",
  "kb@allincapital.vc": "KB",
  "adityasingh@allincapital.vc": "Aditya",
  "adityasingh2@allincapital.vc": "Aditya",
  "aditya@allincapital.vc": "Aditya",
};

function displayName(email: string): string {
  return DISPLAY_NAMES[email] || nameFromEmail(email);
}

/**
 * Invite marker rows live in login_otp_codes so the roster survives across
 * browsers. Hash never matches a real OTP; expires_at is in the past.
 */
function inviteMarkerHash(email: string) {
  return createHash("sha256").update(`invite-marker:${email}`).digest("hex");
}

type OtpRow = {
  email: string;
  created_at: string;
  consumed: boolean;
};

/** Distinct @allincapital.vc addresses that have requested a code or been invited. */
export async function listTeamRoster(
  selfEmail?: string | null,
): Promise<TeamRosterMember[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("login_otp_codes")
    .select("email, created_at, consumed")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const byEmail = new Map<
    string,
    { first: string; last: string; consumed: boolean }
  >();

  for (const row of (data || []) as OtpRow[]) {
    const email = String(row.email || "")
      .trim()
      .toLowerCase();
    if (!email.endsWith("@allincapital.vc")) continue;
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, {
        first: row.created_at,
        last: row.created_at,
        consumed: !!row.consumed,
      });
    } else {
      existing.last = row.created_at;
      if (row.consumed) existing.consumed = true;
    }
  }

  const self = selfEmail?.trim().toLowerCase() || null;
  if (self && self.endsWith("@allincapital.vc") && !byEmail.has(self)) {
    byEmail.set(self, {
      first: new Date().toISOString(),
      last: new Date().toISOString(),
      consumed: true,
    });
  }

  const members: TeamRosterMember[] = [...byEmail.entries()].map(
    ([email, meta]) => {
      let role: TeamMemberRole = meta.consumed ? "member" : "invited";
      if (self && email === self) role = "admin";
      return {
        email,
        name: displayName(email),
        role,
        invitedAt: meta.first,
        joinedAt: meta.consumed ? meta.last : undefined,
      };
    },
  );

  members.sort((a, b) => {
    const rank = (r: TeamMemberRole) =>
      r === "admin" ? 0 : r === "member" ? 1 : 2;
    const d = rank(a.role) - rank(b.role);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });

  return members;
}

/** Record an invite so it shows on every teammate's Team page. */
export async function recordTeamInvite(
  email: string,
  _invitedBy?: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const db = getSupabaseAdmin();

  const { data: existing } = await db
    .from("login_otp_codes")
    .select("id")
    .eq("email", normalized)
    .limit(1)
    .maybeSingle();

  if (existing) return;

  const { error } = await db.from("login_otp_codes").insert({
    email: normalized,
    code_hash: inviteMarkerHash(normalized),
    consumed: false,
    attempts: 0,
    expires_at: new Date(0).toISOString(),
  });

  if (error) throw error;
}
