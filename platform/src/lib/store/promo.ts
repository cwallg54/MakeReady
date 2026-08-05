import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { storePromos, type StorePromo } from "@/db/schema";
import { cartDetails, type CartItem } from "./cart";

const PROMO_COOKIE = "mr_promo";
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function readPromoCode(): Promise<string | null> {
  return (await cookies()).get(PROMO_COOKIE)?.value || null;
}
export async function writePromoCode(code: string): Promise<void> {
  (await cookies()).set(PROMO_COOKIE, code.trim().toUpperCase(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 86400 });
}
export async function clearPromoCode(): Promise<void> {
  (await cookies()).delete(PROMO_COOKIE);
}

/** Validate a code against a subtotal. Returns the promo + computed discount, or an error. */
export async function validatePromo(code: string, subtotal: number): Promise<{ ok: true; promo: StorePromo; discount: number } | { ok: false; error: string }> {
  const norm = code.trim().toUpperCase();
  if (!norm) return { ok: false, error: "Enter a code." };
  const promo = await db.query.storePromos.findFirst({ where: eq(storePromos.code, norm) });
  if (!promo || !promo.active) return { ok: false, error: "That code isn't valid." };
  if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) return { ok: false, error: "That code has expired." };
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) return { ok: false, error: "That code has reached its usage limit." };
  if (subtotal < Number(promo.minSubtotal)) return { ok: false, error: `Spend at least $${Number(promo.minSubtotal).toFixed(2)} to use this code.` };
  const discount = promo.kind === "percent"
    ? round2(subtotal * (Number(promo.value) / 100))
    : Math.min(round2(Number(promo.value)), subtotal);
  return { ok: true, promo, discount };
}

export interface CartTotals {
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  count: number;
  promoCode: string | null;
  promoError: string | null;
}

/** Cart lines + any applied promo, re-validated against the current subtotal. */
export async function getCartTotals(b2b: boolean): Promise<CartTotals> {
  const { items, subtotal, count } = await cartDetails(b2b);
  const code = await readPromoCode();
  let discount = 0, promoError: string | null = null;
  if (code && subtotal > 0) {
    const v = await validatePromo(code, subtotal);
    if (v.ok) discount = v.discount;
    else promoError = v.error;
  }
  return { items, subtotal, discount, total: round2(subtotal - discount), count, promoCode: code, promoError };
}
