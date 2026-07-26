/**
 * Times server render (full response) for the key authenticated pages against
 * production, using a short-lived admin session. Prints median ms per route.
 * Run: pnpm exec tsx scripts/perf-probe.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { db } from "../src/db";
import { users, sessions } from "../src/db/schema";

const BASE = "https://makeready.g54.com";
const ROUTES = [
  "/dashboard", "/crm", "/crm/pipeline", "/sales", "/sales/orders",
  "/inventory", "/inventory?q=tee", "/inventory/bins", "/art", "/production",
  "/sales/automations", "/calendar", "/admin/templates", "/help",
];
const SAMPLES = 4;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function timeOnce(url: string, cookie: string): Promise<{ ms: number; status: number }> {
  const t = performance.now();
  const res = await fetch(url, { headers: { cookie }, redirect: "manual" });
  await res.text();
  return { ms: performance.now() - t, status: res.status };
}

async function main() {
  const admin = await db.query.users.findFirst({ where: eq(users.email, "cwall@g54.com") });
  if (!admin) throw new Error("admin cwall@g54.com not found");
  const sid = randomUUID();
  const exp = new Date(Date.now() + 30 * 60 * 1000);
  await db.insert(sessions).values({ id: sid, userId: admin.id, expiresAt: exp });
  const jwt = await new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" }).setSubject(admin.id).setIssuedAt()
    .setExpirationTime(Math.floor(exp.getTime() / 1000))
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!));
  const cookie = `mr_session=${jwt}`;

  try {
    for (const r of ROUTES) {
      const url = `${BASE}${r}`;
      await timeOnce(url, cookie); // warm
      const runs: number[] = [];
      let status = 0;
      for (let i = 0; i < SAMPLES; i++) { const x = await timeOnce(url, cookie); runs.push(x.ms); status = x.status; }
      console.log(`  ${String(Math.round(median(runs))).padStart(5)} ms  [${status}]  ${r}`);
    }
  } finally {
    await db.delete(sessions).where(eq(sessions.id, sid));
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
