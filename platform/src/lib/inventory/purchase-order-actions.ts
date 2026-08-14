"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  purchaseOrders, purchaseOrderLines, goodsReceipts, goodsReceiptLines,
  inventoryItems, numberSeries,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { postStockMovement } from "./stock";
import { postGoodsReceiptToGl } from "@/lib/accounting/gl-post";

async function requireEdit() {
  const user = await getCurrentUser();
  const ok = user && (canEdit(user.roles, "inventory") || canEdit(user.roles, "accounting"));
  if (!user || !ok || !canView(user.roles, "inventory")) redirect("/403");
  return user;
}
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[$,]/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const dt = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T12:00:00") : null; };

async function nextNumber(documentType: string, prefix: string): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, documentType) });
    if (!s) [s] = await tx.insert(numberSeries).values({ documentType, prefix, nextNumber: 1, padding: 5 }).returning();
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}

export async function createPurchaseOrderAction(formData: FormData) {
  const user = await requireEdit();
  const poNumber = await nextNumber("purchase_order", "PO-");
  const [po] = await db.insert(purchaseOrders).values({
    poNumber,
    vendorId: str(formData.get("vendorId")),
    orderDate: new Date(),
    expectedDate: dt(formData.get("expectedDate")),
    notes: str(formData.get("notes")),
    createdBy: user.id,
  }).returning({ id: purchaseOrders.id });
  await audit({ userId: user.id, action: "purchase_order.create", entityType: "purchase_order", entityId: po.id, metadata: { poNumber } });
  redirect(`/inventory/purchase-orders/${po.id}`);
}

export async function updatePoMetaAction(id: string, formData: FormData) {
  await requireEdit();
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po || po.status !== "draft") redirect(`/inventory/purchase-orders/${id}`);
  await db.update(purchaseOrders).set({
    vendorId: str(formData.get("vendorId")),
    expectedDate: dt(formData.get("expectedDate")),
    notes: str(formData.get("notes")),
    updatedAt: new Date(),
  }).where(eq(purchaseOrders.id, id));
  revalidatePath(`/inventory/purchase-orders/${id}`);
}

export async function addPoLineAction(id: string, formData: FormData) {
  await requireEdit();
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po || po.status !== "draft") redirect(`/inventory/purchase-orders/${id}`);

  let itemId = str(formData.get("itemId"));
  let sku = str(formData.get("sku"));
  let description = str(formData.get("description"));
  let unitCost = num(formData.get("unitCost"));
  // Resolve the inventory item by explicit id or by the typed SKU; pull its
  // name/cost as defaults so the line stays matched for receiving.
  const it = itemId
    ? await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, itemId) })
    : sku
      ? await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.sku, sku) })
      : null;
  if (it) {
    itemId = it.id;
    sku = it.sku;
    description = description ?? it.name;
    if (unitCost <= 0) unitCost = Number(it.cost);
  }
  const qty = num(formData.get("qty"));
  if (qty <= 0) redirect(`/inventory/purchase-orders/${id}?e=qty`);

  const existing = await db.select({ n: purchaseOrderLines.sortOrder }).from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
  const sortOrder = existing.reduce((m, r) => Math.max(m, r.n), -1) + 1;
  await db.insert(purchaseOrderLines).values({
    poId: id, itemId, sku, description, qty: qty.toFixed(2), unitCost: unitCost.toFixed(4),
    binId: str(formData.get("binId")), sortOrder,
  });
  revalidatePath(`/inventory/purchase-orders/${id}`);
}

export async function removePoLineAction(id: string, lineId: string) {
  await requireEdit();
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po || po.status !== "draft") redirect(`/inventory/purchase-orders/${id}`);
  await db.delete(purchaseOrderLines).where(eq(purchaseOrderLines.id, lineId));
  revalidatePath(`/inventory/purchase-orders/${id}`);
}

export async function issuePoAction(id: string) {
  const user = await requireEdit();
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po || po.status !== "draft") redirect(`/inventory/purchase-orders/${id}`);
  const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
  if (lines.length === 0) redirect(`/inventory/purchase-orders/${id}?e=empty`);
  if (!po.vendorId) redirect(`/inventory/purchase-orders/${id}?e=vendor`);
  await db.update(purchaseOrders).set({ status: "open", updatedAt: new Date() }).where(eq(purchaseOrders.id, id));
  await audit({ userId: user.id, action: "purchase_order.issue", entityType: "purchase_order", entityId: id });
  revalidatePath(`/inventory/purchase-orders/${id}`);
}

export async function voidPoAction(id: string) {
  const user = await requireEdit();
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po || po.status === "void") redirect(`/inventory/purchase-orders/${id}`);
  await db.update(purchaseOrders).set({ status: "void", updatedAt: new Date() }).where(eq(purchaseOrders.id, id));
  await audit({ userId: user.id, action: "purchase_order.void", entityType: "purchase_order", entityId: id });
  revalidatePath(`/inventory/purchase-orders/${id}`);
}

/** Receive quantities against an open PO: create a goods receipt, move stock in,
 *  update each line's received qty, revalue item cost (moving average), post GL,
 *  and advance the PO status (open → received when fully received). */
export async function receivePoAction(id: string, formData: FormData) {
  const user = await requireEdit();
  const po = await db.query.purchaseOrders.findFirst({ where: eq(purchaseOrders.id, id) });
  if (!po || (po.status !== "open" && po.status !== "received")) redirect(`/inventory/purchase-orders/${id}`);
  const lines = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id)).orderBy(asc(purchaseOrderLines.sortOrder));

  // Gather the qty to receive per line from the form (recv_<lineId>).
  const toReceive: { line: typeof lines[number]; qty: number; binId: string | null }[] = [];
  for (const l of lines) {
    const qty = num(formData.get(`recv_${l.id}`));
    if (qty <= 0) continue;
    const remaining = Number(l.qty) - Number(l.receivedQty);
    const recv = Math.min(qty, remaining);
    if (recv <= 0) continue;
    const binId = str(formData.get(`bin_${l.id}`)) ?? l.binId;
    if (!l.itemId) redirect(`/inventory/purchase-orders/${id}?e=noitem`);
    if (!binId) redirect(`/inventory/purchase-orders/${id}?e=nobin`);
    toReceive.push({ line: l, qty: recv, binId });
  }
  if (toReceive.length === 0) redirect(`/inventory/purchase-orders/${id}?e=norecv`);

  const grNumber = await nextNumber("goods_receipt", "GR-");
  const [gr] = await db.insert(goodsReceipts).values({
    grNumber, poId: id, receivedDate: dt(formData.get("receivedDate")) ?? new Date(),
    notes: str(formData.get("notes")), createdBy: user.id,
  }).returning({ id: goodsReceipts.id });

  let receivedValue = 0;
  for (const r of toReceive) {
    const unitCost = Number(r.line.unitCost);
    const q = r.qty;
    receivedValue += unitCost * q;
    // Move stock in.
    await postStockMovement({ itemId: r.line.itemId!, binId: r.binId!, delta: q, reason: "receive", note: `PO ${po.poNumber} · ${grNumber}`, userId: user.id });
    // Revalue the item cost (moving average on the received cost).
    const it = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, r.line.itemId!) });
    const prevOnHand = Number(it?.onHand ?? 0) - q; // on-hand already bumped above
    const prevCost = Number(it?.cost ?? 0);
    const newCost = prevOnHand + q > 0 ? (prevOnHand * prevCost + q * unitCost) / (prevOnHand + q) : unitCost;
    await db.update(inventoryItems).set({ cost: newCost.toFixed(2), updatedAt: new Date() }).where(eq(inventoryItems.id, r.line.itemId!));
    // Record the receipt line + bump the PO line's received qty.
    await db.insert(goodsReceiptLines).values({ grId: gr.id, poLineId: r.line.id, itemId: r.line.itemId, qty: q.toFixed(2), unitCost: unitCost.toFixed(4), binId: r.binId });
    await db.update(purchaseOrderLines).set({ receivedQty: (Number(r.line.receivedQty) + q).toFixed(2), binId: r.binId }).where(eq(purchaseOrderLines.id, r.line.id));
  }

  // Post Dr Inventory / Cr GRNI for the received value.
  await postGoodsReceiptToGl(gr.id, receivedValue, user.id);

  // Advance PO status: received when every line is fully received.
  const refreshed = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
  const fullyReceived = refreshed.every((l) => Number(l.receivedQty) >= Number(l.qty) - 0.005);
  await db.update(purchaseOrders).set({ status: fullyReceived ? "received" : "open", updatedAt: new Date() }).where(eq(purchaseOrders.id, id));

  await audit({ userId: user.id, action: "goods_receipt.create", entityType: "goods_receipt", entityId: gr.id, metadata: { poNumber: po.poNumber, grNumber, receivedValue } });
  revalidatePath(`/inventory/purchase-orders/${id}`);
  revalidatePath("/inventory/purchase-orders");
}
