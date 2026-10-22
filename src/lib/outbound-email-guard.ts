/**
 * Outbound founder-email blocklist.
 * Additive guardrails — do not rewrite rating / bucket logic.
 * Keep entries narrow (specific people / domains we must never mail).
 */

const BLOCKED_EMAILS = new Set([
  // Portfolio: Returns (Shivam) — not an inbound; never send pass/call mail.
  "shivam@returns.trade",
]);

const BLOCKED_DOMAINS = new Set([
  // Belt-and-suspenders for any @returns.trade mailbox.
  "returns.trade",
]);

export function normalizeFounderEmail(email: string | null | undefined): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

/** True if we must never send founder-facing mail to this address. */
export function shouldBlockOutboundFounderEmail(
  email: string | null | undefined,
): boolean {
  const normalized = normalizeFounderEmail(email);
  if (!normalized.includes("@")) return false;
  if (BLOCKED_EMAILS.has(normalized)) return true;
  if (BLOCKED_DOMAINS.has(emailDomain(normalized))) return true;
  return false;
}
