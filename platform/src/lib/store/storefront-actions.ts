"use server";

import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { storeOrders, storeOrderItems, numberSeries, notifications, userRoles, users } from "@/db/schema";
import { readCart, writeCart, cartDetails } from "./cart";
import { getCurrentCustomer, registerCustomer, loginCustomer, logoutCustomer } from "./customer-auth";
import { getStoreSettings } from "./settings";
import { writePromoCode, clearPromoCode, getCartTotals, validatePromo } from "./promo";
import { storePromos } from "@/db/schema";
import { sql } from "drizzle-orm";
import { consumeRateLimit, clientIp, retryMessage } from "@/lib/security/rate-limit";
import { sendStoreOrderConfirmation, sendStoreOrderStaffAlert } from "@/lib/email";

export interface StoreFormState {
  error?: string;
  ok?: boolean;
  pending?: boolean;
}

// ---- Cart -----------------------------------------------------------------

export async function addToCartAction(formData: FormData): Promise<void> {
  const id = String(formData.get("productId") ?? "");
  const qty = Math.min(999, Math.max(1, Math.floor(Number(formData.get("qty") ?? 1)) || 1));
  if (!id) return;
  const lines = await readCart();
  const existing = lines.find((l) => l.id === id);
  if (existing) existing.qty = Math.min(999, existing.qty + qty);
  else lines.push({ id, qty });
  await writeCart(lines);
  redirect("/shop/cart");
}

export async function setQtyAction(formData: FormData): Promise<void> {
  const id = String(formData.get("productId") ?? "");
  const qty = Math.floor(Number(formData.get("qty") ?? 0));
  let lines = await readCart();
  if (qty <= 0) lines = lines.filter((l) => l.id !== id);
  else lines = lines.map((l) => (l.id === id ? { ...l, qty: Math.min(999, qty) } : l));
  await writeCart(lines);
  redirect("/shop/cart");
}

export async function removeFromCartAction(formData: FormData): Promise<void> {
  const id = String(formData.get("productId") ?? "");
  await writeCart((await readCart()).filter((l) => l.id !== id));
  redirect("/shop/cart");
}

export async function applyPromoAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim();
  if (code) await writePromoCode(code);
  else await clearPromoCode();
  redirect("/shop/cart");
}

export async function removePromoAction(): Promise<void> {
  await clearPromoCode();
  redirect("/shop/cart");
}

// ---- Customer auth --------------------------------------------------------

export async function registerAction(_prev: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const rl = await consumeRateLimit("store-register", await clientIp(), 10, 3600);
  if (!rl.ok) return { error: `Too many attempts. ${retryMessage(rl.retryAfterSec)}` };
  const res = await registerCustomer({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
  });
  if ("error" in res) return { error: res.error };
  redirect("/shop/login?registered=1");
}

export async function loginAction(_prev: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const rl = await consumeRateLimit("store-login", await clientIp(), 20, 300);
  if (!rl.ok) return { error: `Too many attempts. ${retryMessage(rl.retryAfterSec)}` };
  const res = await loginCustomer(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if ("error" in res) return { error: res.error, pending: res.pending };
  redirect("/shop/account");
}

export async function logoutAction(): Promise<void> {
  await logoutCustomer();
  redirect("/shop");
}

// ---- Checkout (on-account / request — no online payment) ------------------

async function nextOrderNumber(): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "web_order") });
    if (!s) [s] = await tx.insert(numberSeries).values({ documentType: "web_order", prefix: "WEB-", nextNumber: 1000, padding: 5 }).returning();
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}

export async function placeOrderAction(_prev: StoreFormState, formData: FormData): Promise<StoreFormState> {
  const rl = await consumeRateLimit("store-order", await clientIp(), 15, 3600);
  if (!rl.ok) return { error: `Too many attempts. ${retryMessage(rl.retryAfterSec)}` };

  const customer = await getCurrentCustomer();
  const b2b = !!customer;
  const settings = await getStoreSettings();
  if (!settings.enabled) return { error: "The store is currently closed." };
  if (!settings.publicEnabled && !customer) return { error: "Please sign in to place an order." };
  const { items, subtotal, discount, total, promoCode } = await getCartTotals(b2b);
  if (items.length === 0) return { error: "Your cart is empty." };
  // Re-validate the promo at order time (subtotal may have changed).
  const appliedPromo = promoCode && discount > 0 ? (await validatePromo(promoCode, subtotal)) : null;

  const contactName = (customer?.name ?? String(formData.get("contactName") ?? "")).trim();
  const contactEmail = (customer?.email ?? String(formData.get("contactEmail") ?? "")).trim();
  const contactPhone = (customer?.phone ?? String(formData.get("contactPhone") ?? "")).trim();
  const shipping = String(formData.get("shippingAddress") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!contactName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    return { error: "Please provide your name and a valid email." };
  }

  const orderNumber = await nextOrderNumber();
  const orderId = await db.transaction(async (tx) => {
    const [order] = await tx.insert(storeOrders).values({
      orderNumber,
      customerId: customer?.id ?? null,
      isB2b: b2b,
      status: "pending",
      contactName, contactEmail, contactPhone: contactPhone || null,
      shippingAddress: shipping || null,
      notes: notes || null,
      subtotal: subtotal.toFixed(2),
      discount: (appliedPromo?.ok ? appliedPromo.discount : 0).toFixed(2),
      promoCode: appliedPromo?.ok ? promoCode : null,
      total: (appliedPromo?.ok ? total : subtotal).toFixed(2),
    }).returning({ id: storeOrders.id });
    if (appliedPromo?.ok) {
      await tx.update(storePromos).set({ usedCount: sql`${storePromos.usedCount} + 1`, updatedAt: new Date() }).where(eq(storePromos.id, appliedPromo.promo.id));
    }

    await tx.insert(storeOrderItems).values(items.map((i) => ({
      orderId: order.id,
      storeProductId: i.id,
      title: i.title,
      sku: i.sku,
      unitPrice: i.unitPrice.toFixed(2),
      qty: i.qty,
      lineTotal: i.lineTotal.toFixed(2),
    })));
    return order.id;
  });

  // Confirmation email + staff alert/notification. Best-effort — never block the
  // order on an email failure.
  const finalTotal = appliedPromo?.ok ? total : subtotal;
  try {
    const appUrl = process.env.APP_URL ?? "";
    const adminLink = `/web-store/orders/${orderId}`;
    const emailItems = items.map((i) => ({ title: i.title, qty: i.qty, lineTotal: i.lineTotal }));
    await sendStoreOrderConfirmation(contactEmail, orderNumber, emailItems, finalTotal);

    const staff = await db.select({ id: userRoles.userId, email: users.email })
      .from(userRoles).innerJoin(users, eq(users.id, userRoles.userId))
      .where(inArray(userRoles.role, ["admin", "sales_manager"]));
    const uniq = [...new Map(staff.map((s) => [s.id, s])).values()];
    if (uniq.length) {
      await sendStoreOrderStaffAlert(uniq.map((s) => s.email), orderNumber, contactName, finalTotal, b2b, `${appUrl}${adminLink}`);
      await db.insert(notifications).values(uniq.map((s) => ({ userId: s.id, type: "store", title: `New store order ${orderNumber}`, body: `${contactName} · $${finalTotal.toFixed(2)}`, link: adminLink })));
    }
  } catch (e) {
    console.error("store order notify failed", e);
  }

  await writeCart([]);
  await clearPromoCode();
  redirect(`/shop/order/${orderId}`);
}
