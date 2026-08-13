"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderSpecItems, orderAttachments, activities, orderEvents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { ensureJob } from "@/lib/production/actions";
import { notifyTracker, notifyTrackerStage } from "@/lib/orders/notify";
import { DateTime } from "luxon";

// A yyyy-MM-dd form value denotes a calendar day in the business timezone, not
// UTC. Parsing it as `new Date("yyyy-MM-dd")` yields UTC midnight, which renders
// as the previous day in Mountain Time — anchor it to noon Denver instead.
function parseDenverDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const dt = DateTime.fromISO(t, { zone: "America/Denver" }).set({ hour: 12 });
  return dt.isValid ? dt.toJSDate() : null;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/pdf|application\/postscript|image\/vnd\.adobe\.photoshop|application\/illustrator)$/i;

async function requireSalesEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales") || !canEdit(user.roles, "sales")) redirect("/403");
  return user;
}

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

export async function saveOrderDetailsAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const dateStr = String(formData.get("inHandsDate") ?? "").trim();
  await db
    .update(orders)
    .set({
      inHandsDate: dateStr ? new Date(dateStr) : null,
      productionNotes: str(formData.get("productionNotes")),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id));
  await audit({ userId: user.id, action: "order.details", entityType: "order", entityId: id });
  revalidatePath(`/sales/orders/${id}`);
}

// Commercial / fulfillment fields that feed the standard Open Orders reports.
export async function saveOrderInfoAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const amt = num(formData.get("amount"));
  const dateType = String(formData.get("dateType") ?? "ASAP").trim();
  await db
    .update(orders)
    .set({
      orderType: str(formData.get("orderType")),
      poNumber: str(formData.get("poNumber")),
      shipVia: str(formData.get("shipVia")),
      dateType: ["ASAP", "FIRM", "DATED", "RUSH", "EVENT"].includes(dateType) ? dateType : "ASAP",
      dueDate: parseDenverDate(String(formData.get("dueDate") ?? "")),
      // Leave the amount untouched when the field is blank/non-numeric so an
      // empty save can't wipe the value stamped from the quote at conversion.
      ...(amt !== null ? { amount: String(amt) } : {}),
      salesRepId: str(formData.get("salesRepId")),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id));
  await audit({ userId: user.id, action: "order.info", entityType: "order", entityId: id });
  revalidatePath(`/sales/orders/${id}`);
}

export async function addSpecItemAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  const [{ n }] = await db.select({ n: count() }).from(orderSpecItems).where(eq(orderSpecItems.orderId, orderId));
  await db.insert(orderSpecItems).values({
    orderId,
    product: String(formData.get("product") ?? "").trim() || "(item)",
    decorationMethod: str(formData.get("decorationMethod")),
    placement: str(formData.get("placement")),
    colors: str(formData.get("colors")),
    colorCount: num(formData.get("colorCount")),
    sizeBreakdown: str(formData.get("sizeBreakdown")),
    notes: str(formData.get("notes")),
    sortOrder: n,
  });
  await audit({ userId: user.id, action: "order.spec_add", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function updateSpecItemAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!orderId || !itemId) return;
  await db
    .update(orderSpecItems)
    .set({
      product: String(formData.get("product") ?? "").trim() || "(item)",
      decorationMethod: str(formData.get("decorationMethod")),
      placement: str(formData.get("placement")),
      colors: str(formData.get("colors")),
      colorCount: num(formData.get("colorCount")),
      sizeBreakdown: str(formData.get("sizeBreakdown")),
      notes: str(formData.get("notes")),
    })
    .where(and(eq(orderSpecItems.id, itemId), eq(orderSpecItems.orderId, orderId)));
  await audit({ userId: user.id, action: "order.spec_update", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function removeSpecItemAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!orderId || !itemId) return;
  await db.delete(orderSpecItems).where(and(eq(orderSpecItems.id, itemId), eq(orderSpecItems.orderId, orderId)));
  await audit({ userId: user.id, action: "order.spec_remove", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function setReorderAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  const isReorder = formData.get("isReorder") === "on";
  await db.update(orders).set({ isReorder, updatedAt: new Date() }).where(eq(orders.id, orderId));
  await audit({ userId: user.id, action: "order.set_reorder", entityType: "order", entityId: orderId, metadata: { isReorder } });
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function updateFulfillmentAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  // Per-size UPC values arrive as upc_<size>; collect the non-empty ones.
  const upc: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("upc_") && String(v).trim()) upc[k.slice(4)] = String(v).trim();
  }
  await db
    .update(orders)
    .set({
      needsBarcode: formData.get("needsBarcode") === "on",
      needsHangtag: formData.get("needsHangtag") === "on",
      needsFolding: formData.get("needsFolding") === "on",
      nameDrop: str(formData.get("nameDrop")),
      fulfillmentNotes: str(formData.get("fulfillmentNotes")),
      upcBySize: Object.keys(upc).length ? upc : null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
  await audit({ userId: user.id, action: "order.fulfillment", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
}

/** Reorder fast-path: skip proof approval, send the customer a copy, and start
 *  production straight away. Only valid for orders flagged as reorders. */
export async function reorderFastPathAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order || order.voidedAt) return;

  // Ensure it's flagged as a reorder, then jump straight to production.
  if (!order.isReorder) await db.update(orders).set({ isReorder: true }).where(eq(orders.id, orderId));
  await ensureJob(orderId, user.id);
  if (order.stage !== "production") {
    await db.update(orders).set({ stage: "production", updatedAt: new Date() }).where(eq(orders.id, orderId));
    await db.insert(orderEvents).values({ orderId, stage: "production", byUserId: user.id, note: "Reorder fast-path — proof skipped" });
    await notifyTrackerStage(orderId, "production");
  }
  // Send the customer a copy for their records (no approval needed).
  await notifyTracker(orderId, {
    subject: `Your reorder is confirmed — ${order.orderNumber}`,
    headline: "We’ve started your reorder",
    body: "Thanks! Since this repeats a previous order, we’ve gone straight to production. Here’s your copy — no approval needed. Track progress on your order page.",
  });
  if (order.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "other", isSystem: true, content: `Reorder ${order.orderNumber} fast-pathed to production (proof skipped, copy sent)` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "order.reorder_fastpath", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/production");
}

export async function uploadAttachmentsAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  const kind = String(formData.get("kind") ?? "art");
  const notes = str(formData.get("notes"));
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  let saved = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) continue;
    if (!ALLOWED.test(file.type)) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    await db.insert(orderAttachments).values({
      orderId,
      filename: file.name.slice(0, 200),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      kind: ["art", "mockup", "reference", "other"].includes(kind) ? kind : "art",
      contentBase64: buf.toString("base64"),
      notes,
      uploadedBy: user.id,
    });
    saved++;
  }
  await audit({ userId: user.id, action: "order.attach", entityType: "order", entityId: orderId, metadata: { saved } });
  revalidatePath(`/sales/orders/${orderId}`);
}

export async function voidOrderAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return;
  if (!reason) redirect(`/sales/orders/${id}?voiderr=1`);

  const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
  if (!order || order.voidedAt) return;
  await db.update(orders).set({ voidedAt: new Date(), voidReason: reason, voidedBy: user.id, updatedAt: new Date() }).where(eq(orders.id, id));
  if (order.bpId) {
    await db.insert(activities).values({ bpId: order.bpId, userId: user.id, type: "note", isSystem: true, content: `Order ${order.orderNumber} voided — ${reason}` });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: "order.void", entityType: "order", entityId: id, metadata: { reason } });
  revalidatePath(`/sales/orders/${id}`);
  revalidatePath("/sales/orders");
}

export async function removeAttachmentAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const orderId = String(formData.get("orderId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  if (!orderId || !attachmentId) return;
  await db.delete(orderAttachments).where(and(eq(orderAttachments.id, attachmentId), eq(orderAttachments.orderId, orderId)));
  await audit({ userId: user.id, action: "order.attach_remove", entityType: "order", entityId: orderId });
  revalidatePath(`/sales/orders/${orderId}`);
}
