"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { landedCostDocs, landedCostLines, inventoryItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { allocateLanded, nextLandedNumber } from "./landed-cost";

async function requireLandedEdit() {
  const user = await getCurrentUser();
  const ok = user && (canEdit(user.roles, "accounting") || canEdit(user.roles, "inventory"));
  if (!user || !ok || !canView(user.roles, "inventory")) redirect("/403");
  return user;
}
const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function createLandedDocAction(): Promise<void> {
  const user = await requireLandedEdit();
  const docNumber = await nextLandedNumber();
  const [doc] = await db.insert(landedCostDocs).values({ docNumber, createdBy: user.id }).returning({ id: landedCostDocs.id });
  await audit({ userId: user.id, action: "landed.create", entityType: "landed_cost_doc", entityId: doc.id });
  redirect(`/accounting/landed-cost/${doc.id}`);
}

export async function updateLandedMetaAction(formData: FormData): Promise<void> {
  const user = await requireLandedEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const basis = String(formData.get("basis") ?? "quantity") === "value" ? "value" : "quantity";
  await db.update(landedCostDocs).set({
    vendor: str(formData.get("vendor")),
    shipmentRef: str(formData.get("shipmentRef")),
    freightAmount: num(formData.get("freightAmount")).toFixed(2),
    otherCharges: num(formData.get("otherCharges")).toFixed(2),
    otherLabel: str(formData.get("otherLabel")),
    basis,
    notes: str(formData.get("notes")),
    updatedAt: new Date(),
  }).where(eq(landedCostDocs.id, id));
  await audit({ userId: user.id, action: "landed.meta", entityType: "landed_cost_doc", entityId: id });
  revalidatePath(`/accounting/landed-cost/${id}`);
}

export async function addLandedLineAction(formData: FormData): Promise<void> {
  const user = await requireLandedEdit();
  const docId = String(formData.get("docId") ?? "");
  if (!docId) return;
  const doc = await db.query.landedCostDocs.findFirst({ where: eq(landedCostDocs.id, docId), columns: { status: true } });
  if (!doc || doc.status !== "draft") return;

  let itemId = String(formData.get("itemId") ?? "").trim() || null;
  let sku = str(formData.get("sku"));
  let description = str(formData.get("description"));
  let baseUnitCost = num(formData.get("baseUnitCost"));
  // Resolve the inventory item by id, else by SKU — so we can update its cost on apply.
  const it = itemId
    ? await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, itemId) })
    : sku
      ? await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.sku, sku) })
      : undefined;
  if (it) { itemId = it.id; sku = it.sku; if (!description) description = it.name; if (!baseUnitCost) baseUnitCost = Number(it.cost); }
  const qty = num(formData.get("qty"));
  if (qty <= 0) return;
  const count = (await db.select({ id: landedCostLines.id }).from(landedCostLines).where(eq(landedCostLines.docId, docId))).length;
  await db.insert(landedCostLines).values({ docId, itemId, sku, description, qty: qty.toFixed(2), baseUnitCost: baseUnitCost.toFixed(4), sortOrder: count });
  await audit({ userId: user.id, action: "landed.line_add", entityType: "landed_cost_doc", entityId: docId });
  revalidatePath(`/accounting/landed-cost/${docId}`);
}

export async function removeLandedLineAction(formData: FormData): Promise<void> {
  const user = await requireLandedEdit();
  const docId = String(formData.get("docId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (!docId || !lineId) return;
  await db.delete(landedCostLines).where(eq(landedCostLines.id, lineId));
  await audit({ userId: user.id, action: "landed.line_remove", entityType: "landed_cost_doc", entityId: docId });
  revalidatePath(`/accounting/landed-cost/${docId}`);
}

/** Freeze the allocation, update each item's moving-average cost + on-hand, and
 *  lock the doc. The doc is the receiving event (no separate GR module exists). */
export async function applyLandedDocAction(formData: FormData): Promise<void> {
  const user = await requireLandedEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const doc = await db.query.landedCostDocs.findFirst({ where: eq(landedCostDocs.id, id) });
  if (!doc || doc.status !== "draft") return;
  const lines = await db.select().from(landedCostLines).where(eq(landedCostLines.docId, id)).orderBy(asc(landedCostLines.sortOrder));
  if (lines.length === 0) redirect(`/accounting/landed-cost/${id}?err=empty`);

  const charges = Number(doc.freightAmount) + Number(doc.otherCharges);
  const alloc = allocateLanded(
    lines.map((l) => ({ qty: Number(l.qty), baseUnitCost: Number(l.baseUnitCost) })),
    charges,
    doc.basis === "value" ? "value" : "quantity",
  );

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const a = alloc[i];
    await db.update(landedCostLines).set({ allocated: a.allocated.toFixed(2), landedUnitCost: a.landedUnitCost.toFixed(4) }).where(eq(landedCostLines.id, l.id));
    if (!l.itemId) continue;
    // Revalue the item's cost to this shipment's landed cost. On-hand is left to
    // the receiving/bin flow — this only corrects the cost (base + freight share).
    await db.update(inventoryItems).set({ cost: a.landedUnitCost.toFixed(2), updatedAt: new Date() }).where(eq(inventoryItems.id, l.itemId));
  }

  await db.update(landedCostDocs).set({ status: "applied", appliedAt: new Date(), updatedAt: new Date() }).where(eq(landedCostDocs.id, id));
  await audit({ userId: user.id, action: "landed.apply", entityType: "landed_cost_doc", entityId: id, metadata: { charges } });
  revalidatePath(`/accounting/landed-cost/${id}`);
  revalidatePath("/accounting/landed-cost");
}
