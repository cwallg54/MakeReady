import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Edge proxy (formerly "middleware"): coarse authentication gate. Verifies the
 * session JWT (signature + expiry) only — deep checks (session row, user active,
 * RBAC) run in the Node server layer (guards.ts) on each request.
 */

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  // Unauthenticated users are sent to login for everything else.
  // (We intentionally don't bounce token-bearing users away from /login: a valid
  // JWT with a revoked server-side session must be able to reach the login page,
  // otherwise it would loop against the server-side session check.)
  if (!claims && !isPublic(pathname)) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals, the API, and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
