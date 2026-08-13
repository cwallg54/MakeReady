import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, businessPartners, contacts } from "@/db/schema";
import { sendOrderTrackerEmail } from "@/lib/email";
import { sendSms, smsConfigured } from "@/lib/sms/client";
import { ORDER_STAGES, type OrderStage } from "./stages";

/** Best-effort email to the customer pointing at the single order-tracker link.
 *  Resolves the primary contact (falling back to the account email). Never throws
 *  — notification failures must not break the staff action that triggered them. */
export async function notifyTracker(
  orderId: string,
  opts: { subject: string; headline: string; body: string; actionNeeded?: boolean },
): Promise<void> {
  try {
    const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
    if (!order || order.voidedAt || !order.bpId) return;
    const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, order.bpId), eq(contacts.isPrimary, true)) });
    const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) });
    const to = (contact?.email ?? bp?.email ?? "").trim();
    const url = `${process.env.APP_URL ?? ""}/track/${order.publicToken}`;
    if (to) await sendOrderTrackerEmail(to, { orderNumber: order.orderNumber, url, ...opts });
    // Best-effort SMS to the customer when configured (and a number is on file).
    if (smsConfigured()) {
      const phone = (contact?.phone ?? bp?.phone ?? "").trim();
      if (phone) await sendSms(phone, `${opts.headline} — order ${order.orderNumber}. Track & respond: ${url}`);
    }
  } catch (e) {
    console.error("tracker notify failed", e);
  }
}

/** Notify the customer that their order reached a new stage. */
export async function notifyTrackerStage(orderId: string, stage: OrderStage): Promise<void> {
  const s = ORDER_STAGES.find((x) => x.key === stage);
  if (!s) return;
  await notifyTracker(orderId, {
    subject: `Order update — ${s.label}`,
    headline: `${s.icon} ${s.customer}`,
    body: `Your order has moved to the &ldquo;${s.label}&rdquo; stage. You can follow every step, and take care of anything we need from you, on your order page.`,
  });
}
