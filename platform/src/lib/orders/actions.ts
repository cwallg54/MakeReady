"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { and } from "drizzle-orm";
import { orders, orderEvents, orderArtifacts, orderAttachments, activities, businessPartners, contacts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { sendOrderEmail } from "@/lib/email";
import { generateOrderPdf } from "./pdf";
import { notifyTrackerStage, notifyTracker } from "./notify";
import { ORDER_STAGES, type OrderStage } from "./stages";
import { carrierTrackingUrl } from "./shipping";

async function requireSalesEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales")) redirect("/403");
  if (!canEdit(user.roles, "sales")) redirect("/403");
  return user;
}

export async function setOrderStageAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  const stage = String(formData.get("stage") ?? "") as OrderStage;
  if (!id || !ORDER_STAGES.some((s) => s.key === stage)) return;

  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) return;
  const changed = order.stage !== stage;

  await db.update(orders).set({ stage, updatedAt: new Date() }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, stage, byUserId: user.id });
  if (order.bpId) {
    const label = ORDER_STAGES.find((s) => s.key === stage)?.label ?? stage;
    await db.insert(activities).values({ bpId: order.bpId, type: "other", isSystem: true, content: `Order ${order.orderNumber} → ${label}` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "order.stage", entityType: "order", entityId: id, metadata: { stage } });
  if (changed) await notifyTrackerStage(id, stage);
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath("/sales/orders");
}

/** Mark an order shipped — record carrier + tracking, move to the shipped stage,
 *  and notify the customer with a track-your-package link. */
export async function markShippedAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const carrier = String(formData.get("carrier") ?? "").trim() || null;
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim() || null;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order || order.voidedAt) return;

  await db.update(orders).set({ carrier, trackingNumber, shippedAt: order.shippedAt ?? new Date(), stage: "shipped", updatedAt: new Date() }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, stage: "shipped", byUserId: user.id, note: carrier && trackingNumber ? `Shipped via ${carrier} · ${trackingNumber}` : "Shipped" });

  const url = carrierTrackingUrl(carrier, trackingNumber);
  await notifyTracker(id, {
    subject: `Your order ${order.orderNumber} has shipped`,
    headline: "Your order is on its way",
    body: carrier && trackingNumber
      ? `Good news — your order shipped via ${carrier}. Tracking number: ${trackingNumber}.${url ? ` You can track it at ${url}` : ""} You can also follow it on your order page.`
      : "Good news — your order has shipped and is on its way to you. Follow it on your order page.",
    actionNeeded: false,
  });
  if (order.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, type: "other", isSystem: true, content: `Order ${order.orderNumber} shipped${carrier ? ` via ${carrier}` : ""}${trackingNumber ? ` (${trackingNumber})` : ""}` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "order.shipped", entityType: "order", entityId: id, metadata: { carrier, trackingNumber } });
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath("/sales/orders");
}

/** Mark an order delivered — move to the delivered stage and thank the customer. */
export async function markDeliveredAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order || order.voidedAt) return;

  await db.update(orders).set({ deliveredAt: order.deliveredAt ?? new Date(), stage: "delivered", updatedAt: new Date() }).where(eq(orders.id, id));
  await db.insert(orderEvents).values({ orderId: id, stage: "delivered", byUserId: user.id, note: "Delivered" });
  await notifyTracker(id, {
    subject: `Your order ${order.orderNumber} was delivered`,
    headline: "Delivered — thank you!",
    body: "Your order has been delivered. Thank you for your business — we'd love to help with your next project.",
    actionNeeded: false,
  });
  if (order.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, type: "other", isSystem: true, content: `Order ${order.orderNumber} delivered` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "order.delivered", entityType: "order", entityId: id });
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath("/sales/orders");
}

/** Generate the sales-order PDF, save it as an artifact, and email it to the customer. Used for send and resend. */
export async function emailOrderPdfAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order) return;

  const pdf = await generateOrderPdf(id);
  if (!pdf) return;

  // Resolve customer email.
  const bp = order.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : undefined;
  const contact = order.bpId ? await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, order.bpId), eq(contacts.isPrimary, true)) }) : undefined;
  const to = contact?.email ?? bp?.email ?? "";

  // Attach the order PDF (the quoted line items & pricing) plus a preview image
  // of the item — prefer the catalogue image, then a proof/mockup, then customer art.
  const attachments = [{ filename: pdf.filename, content: pdf.base64 }];
  const atts = await db.select().from(orderAttachments).where(eq(orderAttachments.orderId, id));
  const rank: Record<string, number> = { catalog: 0, mockup: 1, art: 2, reference: 3 };
  const image = atts
    .filter((a) => a.mimeType.startsWith("image/"))
    .sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9))[0];
  if (image) attachments.push({ filename: image.filename, content: image.contentBase64 });

  let status: "sent" | "queued" | "saved" = "saved";
  if (to) {
    const sent = await sendOrderEmail(to, order.orderNumber, attachments);
    status = sent ? "sent" : "queued"; // queued = email provider not yet live
  }

  await db.insert(orderArtifacts).values({
    orderId: id,
    filename: pdf.filename,
    contentBase64: pdf.base64,
    sentTo: to || null,
    sentAt: to ? new Date() : null,
    sendStatus: status,
    createdBy: user.id,
  });
  if (order.bpId) {
    const msg = status === "sent" ? `Sales order ${order.orderNumber} PDF emailed to ${to}` : to ? `Sales order ${order.orderNumber} PDF queued for ${to} (email not yet live)` : `Sales order ${order.orderNumber} PDF generated (no customer email on file)`;
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "email", isSystem: true, content: msg });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "order.email_pdf", entityType: "order", entityId: id, metadata: { to, status } });
  revalidatePath(`/sales/orders/${id}`);
}
