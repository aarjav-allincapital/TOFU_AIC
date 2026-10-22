/**
 * Minimal Attio REST client.
 * Inbound list is the default write target. Deal Flow (`vc_deal_flow`) is
 * manual-only through the explicit "Add to Attio" action in the portal.
 * Golden Ticket and VC Funds stay blocked.
 */
const ATTIO_BASE = "https://api.attio.com/v2";

/** Lists we must never write to. */
const BLOCKED_LIST_SLUGS = new Set([
  "vc_deal_flow_6",
  "vc_funds",
]);

export function getAttioToken(): string {
  const token = process.env.ATTIO_API_KEY;
  if (!token) throw new Error("ATTIO_API_KEY is not configured.");
  return token;
}

export function isAttioConfigured(): boolean {
  return Boolean(process.env.ATTIO_API_KEY);
}

/** Cold inbound Kanban (New / Passes / Human Review). */
export function getInboundListSlug(): string {
  const slug = (process.env.ATTIO_INBOUND_LIST_SLUG || "inbound").trim();
  if (!slug) throw new Error("ATTIO_INBOUND_LIST_SLUG is empty.");
  if (BLOCKED_LIST_SLUGS.has(slug) || slug === "vc_deal_flow") {
    throw new Error(
      `Refusing to use list "${slug}" as the Inbound list.`,
    );
  }
  return slug;
}

/** Team Deal Flow Kanban — only used after explicit user confirmation. */
export function getDealFlowListSlug(): string {
  const slug = (process.env.ATTIO_DEAL_FLOW_LIST_SLUG || "vc_deal_flow").trim();
  if (!slug) throw new Error("ATTIO_DEAL_FLOW_LIST_SLUG is empty.");
  if (BLOCKED_LIST_SLUGS.has(slug) || slug === "inbound") {
    throw new Error(
      `Refusing to use list "${slug}" as Deal Flow.`,
    );
  }
  return slug;
}

export class AttioError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "AttioError";
  }
}

export async function attioFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const blockedHit = [...BLOCKED_LIST_SLUGS].find((s) =>
    path.includes(`/lists/${s}`),
  );
  if (blockedHit) {
    throw new Error(`Blocked Attio path (list is off-limits): ${path}`);
  }

  const res = await fetch(`${ATTIO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getAttioToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw new AttioError(
      `Attio ${init.method || "GET"} ${path} → ${res.status}`,
      res.status,
      body,
    );
  }

  return body as T;
}
