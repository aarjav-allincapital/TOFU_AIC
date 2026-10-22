import "server-only";

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

export type DeckFetchOk = {
  ok: true;
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
};

export type DeckFetchFail = {
  ok: false;
  reason: "no_link" | "not_pdf" | "fetch_failed";
  detail?: string;
};

export type DeckFetchResult = DeckFetchOk | DeckFetchFail;

function maxBytes(): number {
  const n = Number(process.env.DECK_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

/** Rewrite common Google Drive share URLs to a direct download endpoint. */
export function normalizeDeckUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);

    // drive.google.com/file/d/<id>/...
    const fileMatch = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (
      (u.hostname === "drive.google.com" || u.hostname.endsWith(".google.com")) &&
      fileMatch?.[1]
    ) {
      return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;
    }

    // drive.google.com/open?id=<id>
    if (u.hostname === "drive.google.com" && u.searchParams.get("id")) {
      return `https://drive.google.com/uc?export=download&id=${u.searchParams.get("id")}`;
    }

    return u.toString();
  } catch {
    return null;
  }
}

function looksLikePdfUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith(".pdf");
  } catch {
    return /\.pdf(\?|#|$)/i.test(url);
  }
}

function isPdfContentType(ct: string | null): boolean {
  if (!ct) return false;
  const lower = ct.toLowerCase();
  return (
    lower.includes("application/pdf") ||
    lower.includes("application/x-pdf") ||
    lower.includes("binary/octet-stream") ||
    lower.includes("application/octet-stream")
  );
}

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  // %PDF-
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

/**
 * Fetch deck bytes. Accepts application/pdf or .pdf URLs (or PDF magic bytes).
 * DocSend / HTML gateways → not_pdf / fetch_failed.
 */
export async function fetchDeckPdf(deckLink: string): Promise<DeckFetchResult> {
  const url = normalizeDeckUrl(deckLink);
  if (!url) return { ok: false, reason: "no_link" };

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "application/pdf,*/*",
        "User-Agent": "TOFU-DeckAgent/1.0 (+https://tofu-aic.vercel.app)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      reason: "fetch_failed",
      detail: `HTTP ${res.status}`,
    };
  }

  const contentType = res.headers.get("content-type") || "";
  const finalUrl = res.url || url;
  const urlSuggestsPdf = looksLikePdfUrl(finalUrl) || looksLikePdfUrl(url);

  const lenHeader = res.headers.get("content-length");
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > maxBytes()) {
      return {
        ok: false,
        reason: "fetch_failed",
        detail: `PDF too large (${len} bytes)`,
      };
    }
  }

  let buf: ArrayBuffer;
  try {
    buf = await res.arrayBuffer();
  } catch (err) {
    return {
      ok: false,
      reason: "fetch_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (buf.byteLength > maxBytes()) {
    return {
      ok: false,
      reason: "fetch_failed",
      detail: `PDF too large (${buf.byteLength} bytes)`,
    };
  }

  const bytes = new Uint8Array(buf);
  const magicOk = startsWithPdfMagic(bytes);
  const typeOk = isPdfContentType(contentType) || urlSuggestsPdf;

  if (!magicOk && !typeOk) {
    // HTML login / DocSend / Drive virus-scan interstitial
    return {
      ok: false,
      reason: "not_pdf",
      detail: contentType || "unknown content-type",
    };
  }

  if (!magicOk && typeOk) {
    // Claimed PDF but not magic — often an HTML interstitial
    const head = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.slice(0, 200))
      .toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html")) {
      return {
        ok: false,
        reason: "not_pdf",
        detail: "HTML interstitial (likely login wall)",
      };
    }
  }

  return {
    ok: true,
    bytes,
    contentType: contentType || "application/pdf",
    finalUrl,
  };
}
