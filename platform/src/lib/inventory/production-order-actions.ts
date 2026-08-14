"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productionOrders, productionOrderLines, inventoryItems, numberSeries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { postStockMovement, binQty } from "./stock";
import { postProductionToGl } from "@/lib/accounting/gl-post";

async function requireEdit() {
  const user = await getCurrentUser();
  const ok = user && (canEdit(user.roles, "inventory") || canEdit(user.roles, "accounting"));
  if (!user || !ok || !canView(user.roles, "inventory")) redirect("/403");
  return user;
}
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[$,]/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

async function nextProductionNumber(): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "production_order") });
    if (!s) [s] = await tx.insert(numberSeries).values({ documentType: "production_order", prefix: "PRD-", nextNumber: 1, padding: 5 }).returning();
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}

export async function createProductionOrderAction(): Promise<void> {
  const user = await requireEdit();
  const docNumber = await nextProductionNumber();
  const [doc] = await db.insert(productionOrders).values({ docNumber, createdBy: user.id }).returning({ id: productionOrders.id });
  await audit({ userId: user.id, action: "production_order.create", entityType: "production_order", entityId: doc.id });
  redirect(`/inventory/production/${doc.id}`);
}

export async function updateProductionMetaAction(formData: FormData): Promise<void> {
  const user = await requireEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(productionOrders).set({ addedCost: num(formData.get("addedCost")).toFixed(2), notes: str(formData.get("notes")), updatedAt: new Date() }).where(eq(productionOrders.id, id));
  await audit({ userId: user.id, action: "production_order.meta", entityType: "production_order", entityId: id });
  revalidatePath(`/inventory/production/${id}`);
}

export async function addProductionLineAction(formData: FormData): Promise<void> {
  const user = await requireEdit();
  const docId = String(formData.get("docId") ?? "");
  const kind = String(formData.get("kind") ?? "") === "produce" ? "produce" : "consume";
  if (!docId) return;
  const doc = await db.query.productionOrders.findFirst({ where: eq(productionOrders.id, docId), columns: { status: true } });
  if (!doc || doc.status !== "draft") return;
  const sku = str(formData.get("sku"));
  const binId = String(formData.get("binId") ?? "").trim() || null;
  const qty = num(formData.get("qty"));
  if (!sku || !binId || qty <= 0) return;
  const it = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.sku, sku) });
  const count = (await db.select({ id: productionOrderLines.id }).from(productionOrderLines).where(eq(productionOrderLines.docId, docId))).length;
  await db.insert(productionOrderLines).values({
    docId, kind, itemId: it?.id ?? null, sku: it?.sku ?? sku, description: it?.name ?? null,
    qty: qty.toFixed(2), binId, unitCost: it ? Number(it.cost).toFixed(4) : "0", sortOrder: count,
  });
  await audit({ userId: user.id, action: "production_order.line_add", entityType: "production_order", entityId: docId, metadata: { kind } });
  revalidatePath(`/inventory/production/${docId}`);
}

export async function removeProductionLineAction(formData: FormData): Promise<void> {
  const user = await requireEdit();
  const docId = String(formData.get("docId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (!docId || !lineId) return;
  await db.delete(productionOrderLines).where(eq(productionOrderLines.id, lineId));
  await audit({ userId: user.id, action: "production_order.line_remove", entityType: "production_order", entityId: docId });
  revalidatePath(`/inventory/production/${docId}`);
}

/** Post the build: consume the blanks, produce the finished goods, roll the blank
 *  cost (+ capitalized added labor) into the finished items' cost. */
export async function postProductionOrderAction(formData: FormData): Promise<void> {
  const user = await requireEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const doc = await db.query.productionOrders.findFirst({ where: eq(productionOrders.id, id) });
  if (!doc || doc.status !== "draft") return;
  const lines = await db.select().from(productionOrderLines).where(eq(productionOrderLines.docId, id)).orderBy(asc(productionOrderLines.sortOrder));
  const consume = lines.filter((l) => l.kind === "consume");
  const produce = lines.filter((l) => l.kind === "produce");
  if (!consume.length || !produce.length) redirect(`/inventory/production/${id}?err=incomplete`);
  if (lines.some((l) => !l.itemId || !l.binId)) redirect(`/inventory/production/${id}?err=unmatched`);
  // Every consume line must have enough stock in its bin.
  for (const l of consume) {
    if ((await binQty(l.itemId!, l.binId!)) < Number(l.qty)) redirect(`/inventory/production/${id}?err=stock`);
  }

  const consumedCost = consume.reduce((s, l) => s + Number(l.qty) * Number(l.unitCost), 0);
  const producedQty = produce.reduce((s, l) => s + Number(l.qty), 0);
  const addedCost = Number(doc.addedCost);
  const finishedUnit = producedQty > 0 ? Math.round(((consumedCost + addedCost) / producedQty) * 10000) / 10000 : 0;

  // Consume blanks.
  for (const l of consume) {
    await postStockMovement({ itemId: l.itemId!, binId: l.binId!, delta: -Number(l.qty), reason: "consume", note: `Production ${doc.docNumber}`, userId: user.id });
  }
  // Produce finished goods, revaluing each finished item's cost (moving average).
  for (const l of produce) {
    const it = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, l.itemId!) });
    const prevOnHand = Number(it?.onHand ?? 0);
    const prevCost = Number(it?.cost ?? 0);
    const q = Number(l.qty);
    const newCost = prevOnHand + q > 0 ? (prevOnHand * prevCost + q * finishedUnit) / (prevOnHand + q) : finishedUnit;
    await postStockMovement({ itemId: l.itemId!, binId: l.binId!, delta: q, reason: "receive", note: `Production ${doc.docNumber}`, userId: user.id });
    await db.update(inventoryItems).set({ cost: newCost.toFixed(2), updatedAt: new Date() }).where(eq(inventoryItems.id, l.itemId!));
    await db.update(productionOrderLines).set({ unitCost: finishedUnit.toFixed(4) }).where(eq(productionOrderLines.id, l.id));
  }
  // Capitalize any added labor/overhead into inventory (Dr Inventory / Cr Production Applied).
  if (addedCost > 0.005) await postProductionToGl(id, addedCost, user.id);

  await db.update(productionOrders).set({ status: "posted", postedAt: new Date(), updatedAt: new Date() }).where(eq(productionOrders.id, id));
  await audit({ userId: user.id, action: "production_order.post", entityType: "production_order", entityId: id, metadata: { consumedCost, producedQty, addedCost } });
  revalidatePath(`/inventory/production/${id}`);
  revalidatePath("/inventory/production");
}
