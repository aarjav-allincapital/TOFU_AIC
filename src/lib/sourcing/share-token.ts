import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";
import { cache } from "react";
import { jwtVerify } from "jose";
import {
  clipShareText,
  emptyShareProfile,
  safePublicWebsite,
  type ShareCardFields,
} from "./share-card";
import { inlineShareImages } from "./share-images";
import { isShareCardId, readStoredShareCard } from "./share-store";

const ALG = "HS256";
const TEXT_LIMITS = {
  company: 80,
  founder: 80,
  blurb: 220,
  website: 300,
  domain: 160,
  stageTimeline: 160,
  funding: 240,
  pedigree: 240,
  hardware: 260,
  moat: 260,
  tam: 260,
  auditStatus: 160,
  linkedin: 300,
  github: 300,
  twitter: 300,
  notes: 260,
} as const;

function secret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return secret;
}

function secretKey() {
  return new TextEncoder().encode(secret());
}

function asText(value: unknown, max: number): string {
  return typeof value === "string" ? clipShareText(value, max) : "";
}

/** Path-safe token. Dots in the JWT are swapped so the route segment stays one piece. */
export function shareTokenToPath(token: string): string {
  return token.replaceAll(".", "~");
}

export function sharePathToToken(param: string): string {
  return param.replaceAll("~", ".");
}

export async function signShareCard(card: ShareCardFields): Promise<string> {
  const payload = {
    kind: "share",
    company: clipShareText(card.company, TEXT_LIMITS.company),
    founder: clipShareText(card.founder, TEXT_LIMITS.founder),
    blurb: clipShareText(card.blurb, TEXT_LIMITS.blurb),
    website: safePublicWebsite(card.website),
    domain: clipShareText(card.domain, TEXT_LIMITS.domain),
    stageTimeline: clipShareText(card.stageTimeline, TEXT_LIMITS.stageTimeline),
    funding: clipShareText(card.funding, TEXT_LIMITS.funding),
    pedigree: clipShareText(card.pedigree, TEXT_LIMITS.pedigree),
    hardware: clipShareText(card.hardware, TEXT_LIMITS.hardware),
    moat: clipShareText(card.moat, TEXT_LIMITS.moat),
    tam: clipShareText(card.tam, TEXT_LIMITS.tam),
    auditStatus: clipShareText(card.auditStatus, TEXT_LIMITS.auditStatus),
    linkedin: safePublicWebsite(card.linkedin),
    github: safePublicWebsite(card.github),
    twitter: safePublicWebsite(card.twitter),
    notes: clipShareText(card.notes, TEXT_LIMITS.notes),
    sharedAt: card.sharedAt,
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  };
  const packed = deflateRawSync(Buffer.from(JSON.stringify(payload))).toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret())
    .update(packed)
    .digest("base64url");
  return `v2~${packed}~${signature}`;
}

/** Memoised per request so metadata, page, and OG image share one lookup. */
export const readShareCard = cache(readShareCardUncached);

async function readShareCardUncached(param: string): Promise<ShareCardFields | null> {
  let raw = param.trim();
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // already decoded
  }
  if (!raw || raw.length > 6000 || /[^A-Za-z0-9_~-]/.test(raw)) return null;
  try {
    if (isShareCardId(raw)) {
      const stored = await readStoredShareCard(raw);
      // Cards minted before images were copied onto the card still point at
      // LinkedIn's CDN; inline them on the way out so recipients see the photo.
      return stored ? await inlineShareImages(stored) : null;
    }
    if (raw.startsWith("v2~")) {
      const [, packed, provided] = raw.split("~");
      if (!packed || !provided) return null;
      const expected = createHmac("sha256", secret()).update(packed).digest();
      const actual = Buffer.from(provided, "base64url");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        return null;
      }
      const payload = JSON.parse(
        inflateRawSync(Buffer.from(packed, "base64url")).toString("utf8"),
      ) as Record<string, unknown>;
      if (
        payload.kind !== "share" ||
        typeof payload.exp !== "number" ||
        payload.exp < Math.floor(Date.now() / 1000)
      ) {
        return null;
      }
      return payloadToCard(payload);
    }

    // Backward compatibility for links minted before full-detail cards.
    const { payload } = await jwtVerify(sharePathToToken(raw), secretKey(), {
      algorithms: [ALG],
      subject: "share",
    });
    if (payload.kind !== "share") return null;
    return payloadToCard(payload);
  } catch {
    return null;
  }
}

function payloadToCard(payload: Record<string, unknown>): ShareCardFields | null {
  const company = asText(payload.company, TEXT_LIMITS.company);
  const founder = asText(payload.founder, TEXT_LIMITS.founder);
  if (!company && !founder) return null;
  const sharedAt = asText(payload.sharedAt, 40);
  return {
    company,
    founder,
    blurb: asText(payload.blurb, TEXT_LIMITS.blurb),
    website: safePublicWebsite(asText(payload.website, TEXT_LIMITS.website)),
    domain: asText(payload.domain, TEXT_LIMITS.domain),
    stageTimeline: asText(payload.stageTimeline, TEXT_LIMITS.stageTimeline),
    funding: asText(payload.funding, TEXT_LIMITS.funding),
    pedigree: asText(payload.pedigree, TEXT_LIMITS.pedigree),
    hardware: asText(payload.hardware, TEXT_LIMITS.hardware),
    moat: asText(payload.moat, TEXT_LIMITS.moat),
    tam: asText(payload.tam, TEXT_LIMITS.tam),
    auditStatus: asText(payload.auditStatus, TEXT_LIMITS.auditStatus),
    linkedin: safePublicWebsite(asText(payload.linkedin, TEXT_LIMITS.linkedin)),
    github: safePublicWebsite(asText(payload.github, TEXT_LIMITS.github)),
    twitter: safePublicWebsite(asText(payload.twitter, TEXT_LIMITS.twitter)),
    notes: asText(payload.notes, TEXT_LIMITS.notes),
    ...emptyShareProfile(),
    sharedAt: Number.isNaN(Date.parse(sharedAt))
      ? new Date().toISOString()
      : sharedAt,
  };
}
