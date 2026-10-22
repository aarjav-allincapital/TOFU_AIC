import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "aic_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  email: string;
  name?: string;
  onboarded?: boolean;
};

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

/** Edge-safe — no cookies()/server-only, so it can run in proxy.ts. */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.email !== "string") return null;
    return {
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : undefined,
      onboarded: payload.onboarded === true,
    };
  } catch {
    return null;
  }
}
