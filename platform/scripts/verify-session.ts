import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { db } from "../src/db";
import { users, sessions } from "../src/db/schema";

/**
 * Dev verification: mint a valid session for an existing user and fetch a
 * protected page, to confirm the authenticated path renders (not a 500/loop).
 * Env: VERIFY_URL (base), VERIFY_EMAIL (default admin@g54.com), AUTH_SECRET, DATABASE_URL.
 */
async function main() {
  const base = process.env.VERIFY_URL!;
  const email = (process.env.VERIFY_EMAIL ?? "admin@g54.com").toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw new Error(`No user ${email}`);

  const sid = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60_000);
  await db.insert(sessions).values({ id: sid, userId: user.id, expiresAt });

  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  const res = await fetch(`${base}/dashboard`, {
    headers: { Cookie: `mr_session=${token}` },
    redirect: "manual",
  });
  const body = await res.text();
  console.log(`GET /dashboard -> ${res.status}`);
  console.log(`  contains "Welcome": ${body.includes("Welcome")}`);
  console.log(`  contains "Platform Foundation": ${body.includes("Platform Foundation")}`);
  if (res.status >= 300 && res.status < 400) console.log(`  redirect -> ${res.headers.get("location")}`);

  await db.delete(sessions).where(eq(sessions.id, sid));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
