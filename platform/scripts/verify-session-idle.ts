import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { db } from "../src/db";
import { users, sessions, systemSettings } from "../src/db/schema";

/**
 * Prove that a session ends on inactivity, not on a fixed period after signing
 * in: using the app pushes the deadline back out, and only an idle stretch
 * longer than the configured window forces a fresh sign-in.
 *
 * Drives a running dev server so the real guard path is exercised, and cleans
 * up the scratch session afterwards.
 *
 * Env: VERIFY_URL (default http://localhost:3100), VERIFY_EMAIL, AUTH_SECRET.
 * Run: pnpm verify:session
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
  const expiresAt = new Date(Date.now() + idleMinutes * 60_000);
  await db.insert(sessions).values({ id: sid, userId: user.id, expiresAt, rememberMe: false });

  // The cookie deliberately outlives the session, so the edge gate never bounces
  // somebody the server would have let through.
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + 30 * 24 * 60 * 60_000) / 1000))
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  const visit = () =>
    fetch(`${BASE}${PAGE}`, { headers: { Cookie: `mr_session=${token}` }, redirect: "manual" });
  const row = async () => (await db.query.sessions.findFirst({ where: eq(sessions.id, sid) }))!;

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

  const after = await row();
  const left = minutesFromNow(after.expiresAt);
  check(
    "using the app resets the idle clock",
    left >= idleMinutes - 2,
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
    idledOut.status === 307 && (idledOut.headers.get("location") ?? "").includes("/login"),
    `status ${idledOut.status} -> ${idledOut.headers.get("location")}`,
  );

  const stillExpired = await row();
  check(
    "an expired session is not revived by the attempt",
    stillExpired.expiresAt.getTime() < Date.now(),
    `expires ${stillExpired.expiresAt.toISOString()}`,
  );

  // ---- remember me widens the window rather than removing it -----------
  await db.update(sessions).set({ rememberMe: true, expiresAt: new Date(Date.now() + 2 * 60_000) }).where(eq(sessions.id, sid));
  check("a remembered session is let through", (await visit()).status === 200);
  const remembered = await row();
  check(
    "remember me stretches the idle window to 30 days",
    minutesFromNow(remembered.expiresAt) > 29 * 24 * 60,
    `${Math.round(minutesFromNow(remembered.expiresAt) / 1440)} days left`,
  );

  await db.delete(sessions).where(eq(sessions.id, sid));
  console.log("\nscratch session removed");
  console.log(failures === 0 ? "Idle session handling verified." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
