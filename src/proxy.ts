import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth/session-core";

const PUBLIC_PATHS = ["/login", "/card"];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (!session && !isPublic) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth|api/sync|api/rate|api/deals/info-reply|_next/static|_next/image|favicon\\.png|favicon-16\\.png|favicon-32\\.png|apple-touch-icon\\.png|icon-192\\.png|icon\\.png|all-in-logo\\.png).*)",
  ],
};
