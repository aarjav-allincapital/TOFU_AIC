import type { DealsPayload } from "./types";

const APPS_SCRIPT_URL =
  process.env.NEXT_PUBLIC_APPS_SCRIPT_URL?.trim() || "";

function looksLikeLoginPage(text: string): boolean {
  const t = text.trimStart().toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.includes("accounts.google.com");
}

/** Parse Apps Script JSON (handles accidental HTML login redirects). */
export function parseAppsScriptPayload(text: string): DealsPayload {
  if (looksLikeLoginPage(text)) {
    throw new Error(
      "Apps Script requires Google sign-in (allincapital.vc). Sign in in this browser, or redeploy the web app as Anyone.",
    );
  }
  const payload = JSON.parse(text) as DealsPayload & { error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!Array.isArray(payload.deals)) {
    throw new Error("Apps Script response missing deals array");
  }
  return {
    deals: payload.deals,
    count: payload.count ?? payload.deals.length,
    fetchedAt: payload.fetchedAt ?? new Date().toISOString(),
    source: "apps-script",
  };
}

/**
 * Fetch deals from the Apps Script web app in the browser (uses Google session).
 * Workspace deployments require the user to be signed into allincapital.vc.
 */
export async function fetchDealsFromAppsScriptClient(): Promise<DealsPayload> {
  if (!APPS_SCRIPT_URL) {
    throw new Error("NEXT_PUBLIC_APPS_SCRIPT_URL is not configured");
  }

  const res = await fetch(APPS_SCRIPT_URL, {
    cache: "no-store",
    credentials: "include",
    redirect: "follow",
  });

  const text = await res.text();
  return parseAppsScriptPayload(text);
}
