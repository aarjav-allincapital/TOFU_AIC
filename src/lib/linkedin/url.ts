/** Normalize to a clean linkedin.com/in/... URL or null. Safe for client + server. */
export function normalizeLinkedInProfileUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (!u.hostname.toLowerCase().includes("linkedin.com")) return null;
    const m = u.pathname.match(/\/in\/([^/?#]+)/i);
    if (!m?.[1]) return null;
    const slug = decodeURIComponent(m[1]).replace(/\/+$/, "");
    if (!slug || slug.length < 2) return null;
    return `https://www.linkedin.com/in/${slug}/`;
  } catch {
    return null;
  }
}
