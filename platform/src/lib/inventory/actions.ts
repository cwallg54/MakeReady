"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { inventoryItems, stockMovements } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function requireInventoryEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "inventory") || !canEdit(user.roles, "inventory")) redirect("/403");
  return user;
}

function slugSku(s: string): string {
  return s.toUpperCase().trim().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}
const num = (v: FormDataEntryValue | null): number => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

export interface InventoryState {
  error?: string;
}

export async function createItemAction(_prev: InventoryState, formData: FormData): Promise<InventoryState> {
  const user = await requireInventoryEdit();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Item name is required." };
  const sku = (String(formData.get("sku") ?? "").trim() ? slugSku(String(formData.get("sku"))) : slugSku(name)) || slugSku(name);
  const existing = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.sku, sku) });
  if (existing) return { error: `SKU "${sku}" already exists.` };

  const onHand = num(formData.get("onHand"));
  const [item] = await db.insert(inventoryItems).values({
    sku,
    name,
    category: String(formData.get("category") ?? "").trim() || null,
    territory: String(formData.get("territory") ?? "").trim() || null,
    unit: String(formData.get("unit") ?? "").trim() || "each",
    supplier: String(formData.get("supplier") ?? "").trim() || null,
    cost: String(num(formData.get("cost"))),
    onHand: String(onHand),
    reorderPoint: String(num(formData.get("reorderPoint"))),
    leadTimeDays: Math.round(num(formData.get("leadTimeDays"))) || 30,
    isImport: formData.get("isImport") === "on",
    notes: String(formData.get("notes") ?? "").trim() || null,
  }).returning({ id: inventoryItems.id });

  if (onHand !== 0) {
    await db.insert(stockMovements).values({ itemId: item.id, delta: String(onHand), reason: "count", note: "Opening balance", byUserId: user.id });
  }
  await audit({ userId: user.id, action: "inventory.item_create", entityType: "inventory_item", entityId: item.id, metadata: { sku } });
  revalidatePath("/inventory");
  redirect(`/inventory/${item.id}`);
}

export async function updateItemAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db
    .update(inventoryItems)
    .set({
      name: String(formData.get("name") ?? "").trim() || "Item",
      category: String(formData.get("category") ?? "").trim() || null,
      territory: String(formData.get("territory") ?? "").trim() || null,
      unit: String(formData.get("unit") ?? "").trim() || "each",
      supplier: String(formData.get("supplier") ?? "").trim() || null,
      cost: String(num(formData.get("cost"))),
      reorderPoint: String(num(formData.get("reorderPoint"))),
      leadTimeDays: Math.round(num(formData.get("leadTimeDays"))) || 30,
      isImport: formData.get("isImport") === "on",
      active: formData.get("active") === "on",
      notes: String(formData.get("notes") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(inventoryItems.id, id));
  await audit({ userId: user.id, action: "inventory.item_update", entityType: "inventory_item", entityId: id });
  revalidatePath(`/inventory/${id}`);
  revalidatePath("/inventory");
}

/** Record a stock movement and update the item's on-hand quantity. */
export async function adjustStockAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "adjust");
  const qty = num(formData.get("qty"));
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!id || !["receive", "consume", "adjust", "count"].includes(reason)) return;

  const item = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, id) });
  if (!item) return;
  const onHand = Number(item.onHand);

  let delta = 0;
  if (reason === "receive") delta = Math.abs(qty);
  else if (reason === "consume") delta = -Math.abs(qty);
  else if (reason === "adjust") delta = qty; // signed
  else if (reason === "count") delta = qty - onHand; // set on-hand to the counted value
  if (delta === 0 && reason !== "count") return;

  await db.insert(stockMovements).values({ itemId: id, delta: String(delta), reason: reason as "receive" | "consume" | "adjust" | "count", note, byUserId: user.id });
  await db.update(inventoryItems).set({ onHand: String(onHand + delta), updatedAt: new Date() }).where(eq(inventoryItems.id, id));
  await audit({ userId: user.id, action: "inventory.adjust", entityType: "inventory_item", entityId: id, metadata: { reason, delta } });
  revalidatePath(`/inventory/${id}`);
  revalidatePath("/inventory");
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const user = await requireInventoryEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(inventoryItems).where(and(eq(inventoryItems.id, id))); // movements cascade
  await audit({ userId: user.id, action: "inventory.item_delete", entityType: "inventory_item", entityId: id });
  revalidatePath("/inventory");
  redirect("/inventory");
}
