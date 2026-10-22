/** Accept a spreadsheet id or a full Google Sheets URL. */
export function parseSourcingSheetId(
  raw: string | null | undefined,
): string | null {
  const t = String(raw || "").trim();
  if (!t) return null;
  const fromUrl = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^[a-zA-Z0-9-_]{20,80}$/.test(t)) return t;
  return null;
}

export function looksLikeLoginPage(text: string): boolean {
  const t = text.trimStart().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    t.includes("accounts.google.com")
  );
}
