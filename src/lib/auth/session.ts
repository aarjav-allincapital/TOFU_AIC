import "server-only";
import { cookies } from "next/headers";
import {
  createSessionToken,
  verifySessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionPayload,
} from "./session-core";

export { SESSION_COOKIE, verifySessionToken, type SessionPayload };

/** Sets the session cookie — call from a Route Handler. */
export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Reads and verifies the current session from cookies (Server Components / Route Handlers). */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}
