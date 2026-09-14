import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "crypto";
import { db } from "@/db";
import {
  users,
  userRoles,
  sessions,
  passwordResetTokens,
  systemSettings,
  SYSTEM_SETTINGS_ID,
  notifications,
  type Role,
} from "@/db/schema";
import { verifyPassword, hashPassword, validatePassword } from "./password";
import {
  SESSION_COOKIE,
  MFA_PENDING_COOKIE,
  signSessionToken,
  verifySessionToken,
  signMfaPendingToken,
  verifyMfaPendingToken,
  sessionCookieOptions,
  pendingCookieOptions,
} from "./session";
import { audit } from "@/lib/audit";
import { userHasMfa } from "@/lib/mfa/service";

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;
/** How long "remember me" lets you be away before signing in again. */
const REMEMBER_DAYS = 30;
/**
 * How long the cookie itself is carried. It deliberately outlives any session:
 * the `sessions` row is the authority on whether a session is alive, and the
 * edge gate only checks the token's signature. If the cookie expired on the
 * idle deadline, a browser left open over lunch would lose the cookie before
 * the server ever got to decide.
 */
const COOKIE_DAYS = REMEMBER_DAYS;
/**
 * Don't rewrite the idle deadline on every single request — only once it has
 * actually moved by this much. An active user costs one small write a minute
 * instead of one per page.
 */
const TOUCH_INTERVAL_MS = 60_000;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  mustResetPassword: boolean;
  mfaEnabled: boolean;
}

async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    ua: h.get("user-agent") ?? null,
  };
}

async function sessionTimeoutMinutes(): Promise<number> {
  const row = await db.query.systemSettings.findFirst();
  if (row?.sessionTimeoutMinutes) return row.sessionTimeoutMinutes;
  return Number(process.env.SESSION_TIMEOUT_MINUTES ?? 60);
}

/** How long this session may sit idle before it has to be signed in again. */
async function idleWindowMs(rememberMe: boolean): Promise<number> {
  if (rememberMe) return REMEMBER_DAYS * 24 * 60 * 60_000;
  return (await sessionTimeoutMinutes()) * 60_000;
}

/** Load the authenticated user for the current request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, claims.sid),
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;

  // The deadline slides: this request is activity, so push it out again. Only
  // an uninterrupted idle stretch longer than the window ends the session.
  const deadline = Date.now() + (await idleWindowMs(session.rememberMe));
  if (deadline - session.expiresAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(deadline) })
      .where(eq(sessions.id, session.id));
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, claims.sub) });
  if (!user || user.status !== "active") return null;

  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id));

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: roleRows.map((r) => r.role),
    mustResetPassword: user.mustResetPassword,
    mfaEnabled: user.mfaEnabled,
  };
});

/**
 * Create a fresh session + cookie for a user. Used by login and by flows that
 * establish a session directly (e.g. auto-login after a forced password reset).
 * Sessions expire on inactivity: the deadline is pushed out on every request,
 * so signing in again is only needed after an idle stretch longer than the
 * configured window (Administration → Configuration, 60 minutes by default).
 */
export async function establishSession(userId: string, rememberMe = false): Promise<void> {
  await createSession(userId, rememberMe);
}

async function createSession(userId: string, rememberMe: boolean): Promise<void> {
  const { ip, ua } = await requestMeta();
  const expiresAt = new Date(Date.now() + (await idleWindowMs(rememberMe)));
  const cookieExpiresAt = new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60_000);

  // Single active session per user: drop any existing sessions first.
  await db.delete(sessions).where(eq(sessions.userId, userId));

  const id = randomUUID();
  await db.insert(sessions).values({ id, userId, expiresAt, rememberMe, ip, userAgent: ua });

  const token = await signSessionToken({ sub: userId, sid: id }, cookieExpiresAt);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(cookieExpiresAt));
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const claims = await verifySessionToken(token);
    if (claims) await db.delete(sessions).where(eq(sessions.id, claims.sid));
    await audit({ userId: claims?.sub ?? null, action: "auth.logout" });
  }
  store.delete(SESSION_COOKIE);
}

export type LoginResult =
  | { ok: true; mfaRequired: boolean; mustReset: boolean; enrollMfa: boolean }
  | { ok: false; error: "invalid" | "locked" };

/** Org requires MFA and this user hasn't enrolled a factor yet. Used to send
 *  them straight to the security page in one redirect (a nested layout-level
 *  redirect during a Server Action's soft navigation renders blank). */
export async function needsMfaEnrollment(userId: string): Promise<boolean> {
  const settings = await db.query.systemSettings.findFirst();
  if (!settings?.requireMfa) return false;
  return !(await userHasMfa(userId));
}

/** Authenticate by email + password. Generic errors; never reveal whether an email exists. */
export async function login(
  email: string,
  password: string,
  rememberMe: boolean,
): Promise<LoginResult> {
  const { ip } = await requestMeta();
  const normalized = email.trim().toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(users.email, normalized) });

  // No user, or invited user without a password set — generic failure.
  if (!user || !user.passwordHash) return { ok: false, error: "invalid" };

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: "locked" };
  }

  const valid = user.status === "active" && (await verifyPassword(password, user.passwordHash));

  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    if (attempts >= LOCK_THRESHOLD) {
      const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      await db
        .update(users)
        .set({ failedLoginAttempts: 0, lockedUntil, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await notifyAdminsOfLockout(user.id, user.email);
      await audit({ userId: user.id, action: "auth.account_locked", entityType: "user", entityId: user.id, ip });
      return { ok: false, error: "locked" };
    }
    await db
      .update(users)
      .set({ failedLoginAttempts: attempts, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await audit({ userId: user.id, action: "auth.login_failed", entityType: "user", entityId: user.id, ip });
    return { ok: false, error: "invalid" };
  }

  await db
    .update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // If the user has a second factor, hold the login pending MFA instead of
  // creating a full session now.
  if (await userHasMfa(user.id)) {
    const token = await signMfaPendingToken(user.id);
    (await cookies()).set(MFA_PENDING_COOKIE, token, pendingCookieOptions());
    await audit({ userId: user.id, action: "auth.mfa_challenge", entityType: "user", entityId: user.id, ip });
    return { ok: true, mfaRequired: true, mustReset: user.mustResetPassword, enrollMfa: false };
  }

  await createSession(user.id, rememberMe);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit({ userId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ip });

  // No factor yet: if the org requires MFA, the caller sends them straight to
  // the security page to enroll (avoids the blank-screen double redirect).
  return { ok: true, mfaRequired: false, mustReset: user.mustResetPassword, enrollMfa: await needsMfaEnrollment(user.id) };
}

/** The user id awaiting a second factor (from the pending cookie), or null. */
export async function getMfaPendingUserId(): Promise<string | null> {
  const token = (await cookies()).get(MFA_PENDING_COOKIE)?.value;
  if (!token) return null;
  return verifyMfaPendingToken(token);
}

/** Finish an MFA-gated login: create the full session and clear the pending cookie. */
export async function completeMfaLogin(): Promise<boolean> {
  const uid = await getMfaPendingUserId();
  if (!uid) return false;
  const user = await db.query.users.findFirst({ where: eq(users.id, uid) });
  if (!user || user.status !== "active") return false;
  await createSession(uid, false);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, uid));
  (await cookies()).delete(MFA_PENDING_COOKIE);
  await audit({ userId: uid, action: "auth.login", entityType: "user", entityId: uid });
  return true;
}

async function notifyAdminsOfLockout(lockedUserId: string, lockedEmail: string) {
  const admins = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(eq(userRoles.role, "admin"));
  if (admins.length === 0) return;
  await db.insert(notifications).values(
    admins.map((a) => ({
      userId: a.userId,
      type: "security",
      title: "Account locked",
      body: `${lockedEmail} was locked after ${LOCK_THRESHOLD} failed login attempts.`,
      link: "/admin/users",
    })),
  );
}

// ---- Password reset -------------------------------------------------------

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Minutes an invite (new-user set-password) link stays valid — 7 days. */
export const INVITE_TTL_MINUTES = 7 * 24 * 60;

/**
 * Create a password-reset token for the email if a matching active user exists.
 * Always returns without revealing existence. Returns the raw token+url when a
 * link was created (so the caller can send/deliver it); null otherwise.
 * `ttlMinutes` defaults to 1 hour for security resets; new-user invites pass
 * INVITE_TTL_MINUTES so the set-password link lasts a week.
 */
export async function createPasswordReset(
  email: string,
  ttlMinutes = 60,
): Promise<{ url: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(users.email, normalized) });
  if (!user || user.status !== "active") return null;

  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(raw),
    expiresAt,
  });
  await audit({ userId: user.id, action: "auth.reset_requested", entityType: "user", entityId: user.id });

  const base = process.env.APP_URL ?? "";
  return { url: `${base}/reset-password?token=${raw}`, email: user.email };
}

export type ResetResult =
  | { ok: true }
  | { ok: false; error: "invalid_token" | "expired" | "weak_password"; details?: string[] };

export async function resetPassword(rawToken: string, newPassword: string): Promise<ResetResult> {
  const policy = validatePassword(newPassword);
  if (policy.length > 0) return { ok: false, error: "weak_password", details: policy };

  const record = await db.query.passwordResetTokens.findFirst({
    where: eq(passwordResetTokens.tokenHash, hashToken(rawToken)),
  });
  if (!record || record.usedAt) return { ok: false, error: "invalid_token" };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, error: "expired" };

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustResetPassword: false, failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, record.userId));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, record.id));
    // Invalidate all existing sessions after a password change.
    await tx.delete(sessions).where(eq(sessions.userId, record.userId));
    await audit({ userId: record.userId, action: "auth.password_reset", entityType: "user", entityId: record.userId }, tx);
  });
  return { ok: true };
}

/** Cleanup helper — remove expired sessions/tokens (safe to call opportunistically). */
export async function pruneExpired(): Promise<void> {
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db
    .delete(passwordResetTokens)
    .where(and(lt(passwordResetTokens.expiresAt, now), gt(passwordResetTokens.expiresAt, new Date(0))));
}

export { SYSTEM_SETTINGS_ID };
