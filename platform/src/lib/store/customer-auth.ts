import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { db } from "@/db";
import { storeCustomers, storeCustomerSessions, storeCustomerInvites, businessPartners, type StoreCustomer } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

/** Storefront customer auth — a separate realm from staff `users`/RBAC, with its
 *  own cookie and session table. Customers self-register (pending) and can't
 *  order until an admin approves them (active). */

const STORE_COOKIE = "mr_store";
const SESSION_DAYS = 30;

function key(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

/** Create a signed session + cookie for a customer (shared by login & invite accept). */
async function startCustomerSession(customerId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const [sess] = await db.insert(storeCustomerSessions).values({ customerId, expiresAt }).returning({ id: storeCustomerSessions.id });
  const token = await new SignJWT({ sid: sess.id, t: "store" })
    .setProtectedHeader({ alg: "HS256" }).setSubject(customerId).setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).sign(key());
  (await cookies()).set(STORE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  await db.update(storeCustomers).set({ lastLoginAt: new Date() }).where(eq(storeCustomers.id, customerId));
}

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

/** Create a one-time set-password invite for a customer; returns the raw token
 *  to put in the emailed link. */
export async function createCustomerInvite(customerId: string, ttlDays = 7): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  await db.insert(storeCustomerInvites).values({ customerId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlDays * 86_400_000) });
  return raw;
}

/** Accept an invite: set the password, activate the account, consume the token,
 *  and sign the customer in. */
export async function acceptCustomerInvite(rawToken: string, password: string): Promise<{ ok: true } | { error: string }> {
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  const inv = await db.query.storeCustomerInvites.findFirst({ where: eq(storeCustomerInvites.tokenHash, hashToken(rawToken)) });
  if (!inv || inv.usedAt || inv.expiresAt.getTime() < Date.now()) return { error: "This link is invalid or has expired — ask us to send a new invite." };
  await db.update(storeCustomers).set({ passwordHash: await hashPassword(password), status: "active", updatedAt: new Date() }).where(eq(storeCustomers.id, inv.customerId));
  await db.update(storeCustomerInvites).set({ usedAt: new Date() }).where(eq(storeCustomerInvites.id, inv.id));
  await startCustomerSession(inv.customerId);
  return { ok: true };
}

export async function getCurrentCustomer(): Promise<StoreCustomer | null> {
  const token = (await cookies()).get(STORE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (payload.t !== "store" || typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    const sess = await db.query.storeCustomerSessions.findFirst({ where: eq(storeCustomerSessions.id, payload.sid) });
    if (!sess || sess.expiresAt.getTime() < Date.now()) return null;
    const c = await db.query.storeCustomers.findFirst({ where: eq(storeCustomers.id, payload.sub) });
    return c && c.status === "active" ? c : null;
  } catch {
    return null;
  }
}

export async function registerCustomer(input: { email: string; password: string; name: string; phone?: string; companyName?: string }): Promise<{ ok: true } | { error: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Please enter a valid email address." };
  if (input.password.length < 8) return { error: "Password must be at least 8 characters." };
  if (!input.name.trim()) return { error: "Please enter your name." };
  const existing = await db.query.storeCustomers.findFirst({ where: eq(storeCustomers.email, email), columns: { id: true } });
  if (existing) return { error: "An account with that email already exists — try signing in." };
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.email, email), columns: { id: true } }).catch(() => null);
  await db.insert(storeCustomers).values({
    email,
    passwordHash: await hashPassword(input.password),
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    companyName: input.companyName?.trim() || null,
    bpId: bp?.id ?? null,
    status: "pending",
  });
  return { ok: true };
}

export async function loginCustomer(emailRaw: string, password: string): Promise<{ ok: true } | { error: string; pending?: boolean }> {
  const email = emailRaw.trim().toLowerCase();
  const c = await db.query.storeCustomers.findFirst({ where: eq(storeCustomers.email, email) });
  if (!c || !c.passwordHash || !(await verifyPassword(password, c.passwordHash))) return { error: "Invalid email or password." };
  if (c.status === "pending") return { error: "Your account is awaiting approval — we'll email you once it's ready.", pending: true };
  if (c.status !== "active") return { error: "This account isn't active. Please contact us." };

  await startCustomerSession(c.id);
  return { ok: true };
}

export async function logoutCustomer(): Promise<void> {
  const store = await cookies();
  const token = store.get(STORE_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, key());
      if (typeof payload.sid === "string") await db.delete(storeCustomerSessions).where(eq(storeCustomerSessions.id, payload.sid));
    } catch { /* ignore */ }
  }
  store.delete(STORE_COOKIE);
}
