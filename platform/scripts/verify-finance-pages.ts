import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { db } from "../src/db";
import { users, sessions } from "../src/db/schema";

/**
 * Smoke-test the finance screens against a running dev server with a real
 * session, so a server-component crash shows up as a 500 instead of reaching
 * production. Env: VERIFY_URL (base), VERIFY_EMAIL, AUTH_SECRET, DATABASE_URL.
 */
const PAGES = [
  "/accounting",
  "/accounting/periods",
  "/accounting/segment-pnl",
  "/accounting/collections",
  "/accounting/payment-runs",
  "/accounting/vendor-credits",
  "/accounting/grni",
  "/accounting/bills",
  "/accounting/flash",
  "/accounting/quarterly",
  "/accounting/close",
  "/accounting/credit-memos",
  "/accounting/deposits",
  "/accounting/payments",
  "/accounting/aging",
  "/accounting/income-statement",
  "/accounting/balance-sheet",
  "/accounting/trial-balance",
  "/accounting/journal",
  "/accounting/chart",
];

async function main() {
  const base = process.env.VERIFY_URL ?? "http://localhost:3100";
  const email = (process.env.VERIFY_EMAIL ?? "cwall@g54.com").toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw new Error(`No user ${email}`);

  const sid = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  await db.insert(sessions).values({ id: sid, userId: user.id, expiresAt });
  const token = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));

  let failures = 0;
  for (const path of PAGES) {
    const started = Date.now();
    try {
      const res = await fetch(`${base}${path}`, { headers: { Cookie: `mr_session=${token}` }, redirect: "manual" });
      const ms = Date.now() - started;
      const flag = res.status === 200 ? "ok " : "FAIL";
      if (res.status !== 200) failures++;
      let extra = "";
      if (res.status >= 300 && res.status < 400) extra = ` -> ${res.headers.get("location")}`;
      if (res.status >= 500) {
        const body = await res.text();
        const m = /<h2[^>]*>([^<]{0,160})/.exec(body) ?? /Error:([^<\n]{0,160})/.exec(body);
        extra = m ? ` — ${m[1].trim()}` : "";
      }
      console.log(`${flag} ${String(res.status).padEnd(4)} ${String(ms).padStart(5)}ms  ${path}${extra}`);
    } catch (e) {
      failures++;
      console.log(`FAIL  ERR       —  ${path} — ${(e as Error).message}`);
    }
  }

  await db.delete(sessions).where(eq(sessions.id, sid));
  console.log(failures === 0 ? "\nAll finance pages rendered." : `\n${failures} page(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
