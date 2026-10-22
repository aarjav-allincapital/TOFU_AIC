/** Only @allincapital.vc addresses can access the portal. */
export const ALLOWED_DOMAIN = "allincapital.vc";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) return false;
  return normalized.endsWith(`@${ALLOWED_DOMAIN}`);
}
