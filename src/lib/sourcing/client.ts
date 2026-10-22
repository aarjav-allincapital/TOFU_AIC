import type { SourcingPayload } from "./types";
import { looksLikeLoginPage } from "./sheet-id";

const PUBLIC_URL = (
  process.env.NEXT_PUBLIC_SOURCING_APPS_SCRIPT_URL || ""
).trim();

export function sourcingAppsScriptClientUrl(): string {
  return PUBLIC_URL;
}

/**
 * Browser fetch — sends the user's Google session, which workspace-locked
 * web apps require. Server-side fetch cannot do that.
 */
export async function fetchSourcingFromAppsScriptClient(): Promise<SourcingPayload> {
  if (!PUBLIC_URL) {
    throw new Error("NEXT_PUBLIC_SOURCING_APPS_SCRIPT_URL is not configured");
  }
  const res = await fetch(PUBLIC_URL, {
    cache: "no-store",
    credentials: "include",
    redirect: "follow",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  if (looksLikeLoginPage(text)) {
    throw new Error("Sourcing Apps Script returned a sign-in page.");
  }
  const payload = JSON.parse(text) as SourcingPayload & { error?: string };
  if (payload.error) throw new Error(payload.error);
  if (!Array.isArray(payload.sourced)) {
    throw new Error("Sourcing Apps Script missing sourced array.");
  }
  return {
    ...payload,
    sourced: payload.sourced,
    configured: true,
    count: payload.sourced.length,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
    source: "apps-script",
  };
}
