import { SignJWT, jwtVerify } from "jose";

/**
 * Session token (JWT) helpers. Edge-safe: uses only `jose`, no DB or Node APIs,
 * so this module can be imported from middleware. The JWT carries the user id
 * (sub) and the server-side session id (sid); the sid is validated against the
 * `sessions` table in the Node runtime (see service.ts).
 */

export const SESSION_COOKIE = "mr_session";

export interface SessionClaims {
  sub: string; // user id
  sid: string; // session id
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  claims: SessionClaims,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({ sid: claims.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      return null;
    }
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
