import "server-only";
import { cookies } from "next/headers";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { storeProducts, inventoryItems, storeCustomerGroups, type StoreCustomer } from "@/db/schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The % discount a customer's pricing group grants (0 if none/inactive). */
export async function customerDiscountPct(customer: StoreCustomer | null): Promise<number> {
  if (!customer?.groupId) return 0;
  const g = await db.query.storeCustomerGroups.findFirst({ where: eq(storeCustomerGroups.id, customer.groupId), columns: { discountPct: true, active: true } });
  return g && g.active ? Number(g.discountPct) : 0;
}

/** Cookie-based cart (no login needed to shop). Kept small: product id + qty. */
const CART_COOKIE = "mr_cart";

export interface CartLine {
  id: string;
  qty: number;
}
export interface CartItem {
  id: string;
  title: string;
  slug: string;
  sku: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  image: string | null;
}

export async function readCart(): Promise<CartLine[]> {
  const raw = (await cookies()).get(CART_COOKIE)?.value;
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.id === "string" && Number(x.qty) > 0)
      .map((x) => ({ id: x.id as string, qty: Math.min(999, Math.max(1, Math.floor(Number(x.qty)))) }));
  } catch {
    return [];
  }
}

export async function writeCart(lines: CartLine[]): Promise<void> {
  (await cookies()).set(CART_COOKIE, JSON.stringify(lines), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86_400,
  });
}

/** B2B customers pay the B2B price when set; everyone else pays retail. A group
 *  discount % (if any) is then applied on top. */
export function priceFor(p: { retailPrice: string; b2bPrice: string | null }, b2b: boolean, discountPct = 0): number {
  const retail = Number(p.retailPrice);
  const b2bPrice = p.b2bPrice != null ? Number(p.b2bPrice) : null;
  const base = b2b && b2bPrice != null ? b2bPrice : retail;
  return discountPct > 0 ? round2(base * (1 - discountPct / 100)) : base;
}

/** Resolve the cart cookie to full line items (dropping unpublished/removed). */
export async function cartDetails(b2b: boolean, discountPct = 0): Promise<{ items: CartItem[]; subtotal: number; count: number }> {
  const lines = await readCart();
  if (!lines.length) return { items: [], subtotal: 0, count: 0 };
  const ids = lines.map((l) => l.id);
  const rows = await db
    .select({
      id: storeProducts.id, title: storeProducts.title, slug: storeProducts.slug,
      retailPrice: storeProducts.retailPrice, b2bPrice: storeProducts.b2bPrice, published: storeProducts.published,
      imageBase64: storeProducts.imageBase64, imageMimeType: storeProducts.imageMimeType,
      sku: inventoryItems.sku, invImg: inventoryItems.imageBase64, invMime: inventoryItems.imageMimeType,
    })
    .from(storeProducts)
    .leftJoin(inventoryItems, eq(storeProducts.inventoryItemId, inventoryItems.id))
    .where(inArray(storeProducts.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));

  const items: CartItem[] = [];
  for (const l of lines) {
    const p = byId.get(l.id);
    if (!p || !p.published) continue;
    const unitPrice = priceFor(p, b2b, discountPct);
    items.push({
      id: p.id, title: p.title, slug: p.slug, sku: p.sku, qty: l.qty,
      unitPrice, lineTotal: unitPrice * l.qty,
      image: p.imageBase64 ? `data:${p.imageMimeType ?? "image/png"};base64,${p.imageBase64}`
        : p.invImg ? `data:${p.invMime ?? "image/png"};base64,${p.invImg}` : null,
    });
  }
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);
  return { items, subtotal, count };
}
