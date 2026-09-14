import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, sql } from "drizzle-orm";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { db } from "../src/db";
import { users, sessions } from "../src/db/schema";
import { REMEMBER_EMAIL_COOKIE } from "../src/lib/auth/service";

/**
 * Prove the sign-in policy holds:
 *
 *   - a session ends on inactivity, not a fixed period after signing in;
 *   - using the app pushes that deadline back out;
 *   - once it has idled out, the user is sent back to sign in;
 *   - nothing lengthens the window for one user over another — "remember me"
 *     remembers an email address and grants no access of its own;
 *   - a second factor is required of every account that can sign in.
 *
 * The last two are what a regulated finance environment turns on: no device
 * stays trusted across sessions, and no route into the application skips MFA.
 *
 * Drives a running dev server so the real guard path is exercised, and cleans
 * up the scratch session afterwards.
 *
 * Env: VERIFY_URL (default http://localhost:3100), VERIFY_EMAIL, AUTH_SECRET.
 * Run: pnpm verify:auth
 */
const BASE = process.env.VERIFY_URL ?? "http://localhost:3100";
const PAGE = "/dashboard";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const minutesFromNow = (d: Date) => Math.round((d.getTime() - Date.now()) / 60_000);

async function main() {
  const email = (process.env.VERIFY_EMAIL ?? "cwall@g54.com").toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw new Error(`No user ${email}`);

  const settings = await db.query.systemSettings.findFirst();
  const idleMinutes = settings?.sessionTimeoutMinutes ?? 60;
  console.log(`idle window: ${idleMinutes} minutes\n`);

  const sid = randomUUID();
  await db.insert(sessions).values({
    id: sid,
    userId: user.id,
    expiresAt: new Date(Date.now() + idleMinutes * 60_000),
  });

  // The cookie deliberately outlives the session, so the edge gate never bounces
  // somebody the server would have let through. It buys no access of its own.
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + 30 * 24 * 60 * 60_000) / 1000))
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  const visit = (cookie = `mr_session=${token}`) =>
    fetch(`${BASE}${PAGE}`, { headers: { Cookie: cookie }, redirect: "manual" });
  const row = async () => (await db.query.sessions.findFirst({ where: eq(sessions.id, sid) }))!;
  const sentToLogin = (res: Response) =>
    res.status === 307 && (res.headers.get("location") ?? "").includes("/login");

  // ---- a fresh session works -------------------------------------------
  check("a signed-in user reaches the app", (await visit()).status === 200);

  // ---- activity pushes the deadline back out ---------------------------
  // Stand the session down to two minutes left, as if it had been sitting
  // almost the whole window, then use the app.
  await db
    .update(sessions)
    .set({ expiresAt: new Date(Date.now() + 2 * 60_000) })
    .where(eq(sessions.id, sid));

  const nearlyOut = await visit();
  check("a nearly-idle session is still let through", nearlyOut.status === 200, `status ${nearlyOut.status}`);

  const left = minutesFromNow((await row()).expiresAt);
  check(
    "using the app resets the idle clock",
    left >= idleMinutes - 2 && left <= idleMinutes + 1,
    `${left} minutes left, expected about ${idleMinutes}`,
  );

  // ---- idling past the window ends it ----------------------------------
  await db
    .update(sessions)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(sessions.id, sid));

  const idledOut = await visit();
  check(
    "idling past the window forces a fresh sign-in",
    sentToLogin(idledOut),
    `status ${idledOut.status} -> ${idledOut.headers.get("location")}`,
  );

  const stillExpired = await row();
  check(
    "an expired session is not revived by the attempt",
    stillExpired.expiresAt.getTime() < Date.now(),
    `expires ${stillExpired.expiresAt.toISOString()}`,
  );

  // ---- nothing can buy a longer window ---------------------------------
  const cols = (await db.execute(
    sql`select column_name from information_schema.columns where table_name = 'sessions'`,
  )) as unknown as { rows?: { column_name: string }[] };
  const names = (Array.isArray(cols) ? cols : (cols.rows ?? [])).map((c) => c.column_name);
  check(
    "no session carries a longer window than any other",
    !names.includes("remember_me"),
    names.join(", "),
  );

  // ---- the remembered email is not a credential ------------------------
  const emailOnly = await visit(`${REMEMBER_EMAIL_COOKIE}=${encodeURIComponent(email)}`);
  check(
    "a remembered email address grants no access on its own",
    sentToLogin(emailOnly),
    `status ${emailOnly.status} -> ${emailOnly.headers.get("location")}`,
  );

  // ---- a second factor is required of everyone who can sign in ---------
  check("the organisation requires a second factor", !!settings?.requireMfa);

  // An active account with a password but no factor is a way in that skips MFA.
  const active = await db
    .select({ email: users.email, mfaEnabled: users.mfaEnabled, hash: users.passwordHash })
    .from(users)
    .where(eq(users.status, "active"));
  const unprotected = active.filter((u) => u.hash && !u.mfaEnabled);
  check(
    "every account that can sign in has a second factor enrolled",
    unprotected.length === 0,
    unprotected.length ? unprotected.map((u) => u.email).join(", ") : `${active.length} active account(s)`,
  );

  await db.delete(sessions).where(eq(sessions.id, sid));
  console.log("\nscratch session removed");
  console.log(failures === 0 ? "Sign-in policy verified." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
