"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements, warehouses, bins, itemBinStock } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function requireInventoryEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "inventory") || !canEdit(user.roles, "inventory")) redirect("/403");
  return user;
}
const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

/** Total on-hand = sum of the item's bin quantities. Keeps inventory_items.onHand in sync. */
async function recomputeOnHand(itemId: string) {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${itemBinStock.qty}), 0)` })
    .from(itemBinStock)
    .where(eq(itemBinStock.itemId, itemId));
  await db.update(inventoryItems).set({ onHand: String(row?.total ?? 0), updatedAt: new Date() }).where(eq(inventoryItems.id, itemId));
}

async function setBinQty(itemId: string, binId: string, qty: number) {
  const existing = await db.query.itemBinStock.findFirst({ where: and(eq(itemBinStock.itemId, itemId), eq(itemBinStock.binId, binId)) });
  if (existing) await db.update(itemBinStock).set({ qty: String(qty), updatedAt: new Date() }).where(eq(itemBinStock.id, existing.id));
  else await db.insert(itemBinStock).values({ itemId, binId, qty: String(qty) });
}
async function binQty(itemId: string, binId: string): Promise<number> {
  const r = await db.query.itemBinStock.findFirst({ where: and(eq(itemBinStock.itemId, itemId), eq(itemBinStock.binId, binId)) });
  return r ? Number(r.qty) : 0;
}

export async function createWarehouseAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return;
  const existing = await db.query.warehouses.findFirst({ where: eq(warehouses.code, code) });
  if (existing) return;
  await db.insert(warehouses).values({ code, name, isDefault: formData.get("isDefault") === "on" });
  await audit({ userId: user.id, action: "inventory.warehouse_create", entityType: "warehouse", entityId: code });
  revalidatePath("/inventory/bins");
}

export async function createBinAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!warehouseId || !code) return;
  const dup = await db.query.bins.findFirst({ where: and(eq(bins.warehouseId, warehouseId), eq(bins.code, code)) });
  if (dup) return;
  await db.insert(bins).values({
    warehouseId,
    code,
    description: String(formData.get("description") ?? "").trim() || null,
    isReceiving: formData.get("isReceiving") === "on",
  });
  await audit({ userId: user.id, action: "inventory.bin_create", entityType: "bin", entityId: code });
  revalidatePath("/inventory/bins");
}

export async function toggleWarehouseActiveAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const w = await db.query.warehouses.findFirst({ where: eq(warehouses.id, id) });
  if (!w) return;
  await db.update(warehouses).set({ active: !w.active }).where(eq(warehouses.id, id));
  await audit({ userId: user.id, action: "inventory.warehouse_toggle", entityType: "warehouse", entityId: id, metadata: { active: !w.active } });
  revalidatePath("/inventory/bins");
}

/** Hard-delete a warehouse (and its empty bins). Blocked if it holds stock or is the default. */
export async function deleteWarehouseAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const w = await db.query.warehouses.findFirst({ where: eq(warehouses.id, id) });
  if (!w || w.isDefault) return; // never delete the default warehouse
  const whBins = await db.select({ id: bins.id }).from(bins).where(eq(bins.warehouseId, id));
  if (whBins.length) {
    const [stock] = await db.select({ n: sql<number>`count(*)::int` }).from(itemBinStock).where(and(inArray(itemBinStock.binId, whBins.map((b) => b.id)), gt(itemBinStock.qty, "0")));
    if ((stock?.n ?? 0) > 0) return; // holds stock — deactivate instead
  }
  await db.delete(warehouses).where(eq(warehouses.id, id)); // bins + zero itemBinStock cascade
  await audit({ userId: user.id, action: "inventory.warehouse_delete", entityType: "warehouse", entityId: id });
  revalidatePath("/inventory/bins");
}

export async function toggleBinActiveAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const b = await db.query.bins.findFirst({ where: eq(bins.id, id) });
  if (!b) return;
  await db.update(bins).set({ active: !b.active }).where(eq(bins.id, id));
  await audit({ userId: user.id, action: "inventory.bin_toggle", entityType: "bin", entityId: id, metadata: { active: !b.active } });
  revalidatePath("/inventory/bins");
}

/** Hard-delete a bin. Blocked if it holds stock. */
export async function deleteBinAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const [stock] = await db.select({ n: sql<number>`count(*)::int` }).from(itemBinStock).where(and(eq(itemBinStock.binId, id), gt(itemBinStock.qty, "0")));
  if ((stock?.n ?? 0) > 0) return; // holds stock — deactivate instead
  await db.delete(bins).where(eq(bins.id, id)); // zero itemBinStock cascades
  await audit({ userId: user.id, action: "inventory.bin_delete", entityType: "bin", entityId: id });
  revalidatePath("/inventory/bins");
}

/** Receive / consume / count / adjust an item's quantity in a specific bin. */
export async function binAdjustAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const itemId = String(formData.get("itemId") ?? "");
  const binId = String(formData.get("binId") ?? "");
  const reason = String(formData.get("reason") ?? "adjust");
  const qty = num(formData.get("qty"));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!itemId || !binId || !["receive", "consume", "adjust", "count"].includes(reason)) return;

  const cur = await binQty(itemId, binId);
  let delta = 0;
  if (reason === "receive") delta = Math.abs(qty);
  else if (reason === "consume") delta = -Math.abs(qty);
  else if (reason === "adjust") delta = qty;
  else if (reason === "count") delta = qty - cur;
  if (delta === 0 && reason !== "count") return;

  await setBinQty(itemId, binId, cur + delta);
  await db.insert(stockMovements).values({ itemId, binId, delta: String(delta), reason: reason as "receive" | "consume" | "adjust" | "count", note, byUserId: user.id });
  await recomputeOnHand(itemId);
  await audit({ userId: user.id, action: "inventory.bin_adjust", entityType: "inventory_item", entityId: itemId, metadata: { binId, reason, delta } });
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
}

/** Transfer a quantity of an item from one bin to another (total on-hand unchanged). */
export async function binTransferAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const itemId = String(formData.get("itemId") ?? "");
  const fromBinId = String(formData.get("fromBinId") ?? "");
  const toBinId = String(formData.get("toBinId") ?? "");
  const qty = Math.abs(num(formData.get("qty")));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!itemId || !fromBinId || !toBinId || fromBinId === toBinId || qty <= 0) return;

  await setBinQty(itemId, fromBinId, (await binQty(itemId, fromBinId)) - qty);
  await setBinQty(itemId, toBinId, (await binQty(itemId, toBinId)) + qty);
  await db.insert(stockMovements).values({ itemId, binId: fromBinId, toBinId, delta: String(-qty), reason: "transfer", note, byUserId: user.id });
  await recomputeOnHand(itemId);
  await audit({ userId: user.id, action: "inventory.bin_transfer", entityType: "inventory_item", entityId: itemId, metadata: { fromBinId, toBinId, qty } });
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
}
