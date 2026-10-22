import "server-only";

const MAX_EXTRACT_CHARS = 40_000;

export type DeckExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "empty"; detail?: string };

/**
 * Extract plain text from PDF bytes via unpdf (serverless-friendly).
 */
export async function extractPdfText(bytes: Uint8Array): Promise<DeckExtractResult> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    const raw = result?.text;
    const text = (Array.isArray(raw) ? raw.join("\n") : String(raw || ""))
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text || text.length < 40) {
      return {
        ok: false,
        reason: "empty",
        detail: text ? `only ${text.length} chars` : "no extractable text",
      };
    }

    return { ok: true, text: text.slice(0, MAX_EXTRACT_CHARS) };
  } catch (err) {
    return {
      ok: false,
      reason: "empty",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
