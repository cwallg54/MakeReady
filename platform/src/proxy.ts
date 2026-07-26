import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

/**
 * Edge proxy (formerly "middleware"): coarse authentication gate. Verifies the
 * session JWT (signature + expiry) only — deep checks (session row, user active,
 * RBAC) run in the Node server layer (guards.ts) on each request.
 */

const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/lead", "/track", "/apply", "/schedule", "/proof"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Per-request Content-Security-Policy. A nonce authorizes Next.js's own inline
 *  bootstrap script; strict-dynamic lets it load its chunks. Everything else is
 *  locked to same-origin. Blocks injected/3rd-party scripts (XSS) and framing. */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySessionToken(token) : null;

  // Unauthenticated users are sent to login for everything else.
  // (We intentionally don't bounce token-bearing users away from /login: a valid
  // JWT with a revoked server-side session must be able to reach the login page,
  // otherwise it would loop against the server-side session check.)
  if (!claims && !isPublic(pathname)) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  // Forward the pathname (path-aware MFA policy) and the CSP/nonce so Next.js
  // stamps the nonce onto its scripts; also set CSP on the response.
  const fwd = new Headers(req.headers);
  fwd.set("x-pathname", pathname);
  fwd.set("x-nonce", nonce);
  fwd.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: fwd } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // Run on everything except Next internals, the API, and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
