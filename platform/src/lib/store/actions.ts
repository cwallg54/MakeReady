"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { storeProducts, storeCategories, inventoryItems, storeCustomers, storeOrders, storeOrderItems, stockMovements, storeSettings } from "@/db/schema";
import { getStoreSettings } from "./settings";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const MAX_IMG = 10 * 1024 * 1024;

async function requireStoreEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "web_store")) redirect("/403");
  return user;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
function money(v: FormDataEntryValue | null): string {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : "0.00";
}
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

/** A slug unique across store_products (appends -2, -3, … on collision). */
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    const clash = await db.query.storeProducts.findFirst({
      where: excludeId ? and(eq(storeProducts.slug, candidate), ne(storeProducts.id, excludeId)) : eq(storeProducts.slug, candidate),
      columns: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

async function readImage(formData: FormData): Promise<{ base64: string; mime: string } | null> {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0 && file.size <= MAX_IMG && file.type.startsWith("image/")) {
    return { base64: Buffer.from(await file.arrayBuffer()).toString("base64"), mime: file.type };
  }
  return null;
}

// ---- Products -------------------------------------------------------------

/** Publish an inventory item to the store as a draft product, then edit it. */
export async function addFromInventoryAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const inventoryItemId = str(formData.get("inventoryItemId"));
  if (!inventoryItemId) return;
  const item = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, inventoryItemId) });
  if (!item) return;
  const existing = await db.query.storeProducts.findFirst({ where: eq(storeProducts.inventoryItemId, inventoryItemId), columns: { id: true } });
  if (existing) redirect(`/web-store/products/${existing.id}`);

  const [row] = await db.insert(storeProducts).values({
    inventoryItemId,
    title: item.name,
    slug: await uniqueSlug(item.name),
    retailPrice: "0.00",
    visibility: "both",
    published: false,
    createdBy: user.id,
  }).returning({ id: storeProducts.id });
  await audit({ userId: user.id, action: "store.product_add", entityType: "store_product", entityId: row.id, metadata: { inventoryItemId } });
  redirect(`/web-store/products/${row.id}`);
}

/** Create a standalone product (not backed by inventory). */
export async function createStoreProductAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const title = str(formData.get("title"));
  if (!title) redirect("/web-store/products/new?err=title");
  const img = await readImage(formData);
  const [row] = await db.insert(storeProducts).values({
    title: title!,
    slug: await uniqueSlug(title!),
    description: str(formData.get("description")),
    retailPrice: money(formData.get("retailPrice")),
    b2bPrice: str(formData.get("b2bPrice")) ? money(formData.get("b2bPrice")) : null,
    visibility: (str(formData.get("visibility")) as "public" | "b2b" | "both") ?? "both",
    categoryId: str(formData.get("categoryId")),
    imageBase64: img?.base64 ?? null,
    imageMimeType: img?.mime ?? null,
    createdBy: user.id,
  }).returning({ id: storeProducts.id });
  await audit({ userId: user.id, action: "store.product_create", entityType: "store_product", entityId: row.id });
  redirect(`/web-store/products/${row.id}`);
}

export async function updateStoreProductAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  const existing = await db.query.storeProducts.findFirst({ where: eq(storeProducts.id, id) });
  if (!existing) redirect("/web-store");
  const title = str(formData.get("title")) ?? existing.title;
  const img = await readImage(formData);

  await db.update(storeProducts).set({
    title,
    slug: str(formData.get("slug")) ? await uniqueSlug(str(formData.get("slug"))!, id) : existing.slug,
    description: str(formData.get("description")),
    categoryId: str(formData.get("categoryId")),
    retailPrice: money(formData.get("retailPrice")),
    b2bPrice: str(formData.get("b2bPrice")) ? money(formData.get("b2bPrice")) : null,
    visibility: (str(formData.get("visibility")) as "public" | "b2b" | "both") ?? existing.visibility,
    featured: formData.get("featured") === "on",
    taxable: formData.get("taxable") === "on",
    published: formData.get("published") === "on",
    ...(img ? { imageBase64: img.base64, imageMimeType: img.mime } : {}),
    updatedAt: new Date(),
  }).where(eq(storeProducts.id, id));
  await audit({ userId: user.id, action: "store.product_update", entityType: "store_product", entityId: id });
  revalidatePath("/web-store");
  redirect(`/web-store/products/${id}`);
}

/** Toggle published from the list (quick action). */
export async function togglePublishAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  const p = await db.query.storeProducts.findFirst({ where: eq(storeProducts.id, id), columns: { published: true } });
  if (!p) return;
  await db.update(storeProducts).set({ published: !p.published, updatedAt: new Date() }).where(eq(storeProducts.id, id));
  await audit({ userId: user.id, action: "store.product_publish", entityType: "store_product", entityId: id, metadata: { published: !p.published } });
  revalidatePath("/web-store");
}

export async function deleteStoreProductAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  await db.delete(storeProducts).where(eq(storeProducts.id, id));
  await audit({ userId: user.id, action: "store.product_delete", entityType: "store_product", entityId: id });
  redirect("/web-store");
}

// ---- Categories -----------------------------------------------------------

export async function addCategoryAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const name = str(formData.get("name"));
  if (!name) return;
  await db.insert(storeCategories).values({ name, slug: await uniqueCategorySlug(name), description: str(formData.get("description")) }).onConflictDoNothing();
  await audit({ userId: user.id, action: "store.category_add", entityType: "store_category", entityId: name });
  revalidatePath("/web-store/categories");
}

async function uniqueCategorySlug(base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    const clash = await db.query.storeCategories.findFirst({ where: eq(storeCategories.slug, candidate), columns: { id: true } });
    if (!clash) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

export async function toggleCategoryAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  const c = await db.query.storeCategories.findFirst({ where: eq(storeCategories.id, id), columns: { active: true } });
  if (!c) return;
  await db.update(storeCategories).set({ active: !c.active, updatedAt: new Date() }).where(eq(storeCategories.id, id));
  await audit({ userId: user.id, action: "store.category_toggle", entityType: "store_category", entityId: id });
  revalidatePath("/web-store/categories");
}

// ---- Settings -------------------------------------------------------------

export async function updateStoreSettingsAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const current = await getStoreSettings();
  await db.update(storeSettings).set({
    storeName: str(formData.get("storeName")) ?? "The G54 Store",
    tagline: str(formData.get("tagline")),
    heroHeadline: str(formData.get("heroHeadline")),
    heroSubtext: str(formData.get("heroSubtext")),
    contactEmail: str(formData.get("contactEmail")),
    enabled: formData.get("enabled") === "on",
    publicEnabled: formData.get("publicEnabled") === "on",
    updatedAt: new Date(),
  }).where(eq(storeSettings.id, current.id));
  await audit({ userId: user.id, action: "store.settings_update", entityType: "store_settings", entityId: current.id });
  revalidatePath("/web-store/settings");
  revalidatePath("/shop");
}

// ---- Customers (approval) -------------------------------------------------

export async function setCustomerStatusAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status || !["active", "rejected", "suspended", "pending"].includes(status)) return;
  await db.update(storeCustomers).set({
    status: status as "active" | "rejected" | "suspended" | "pending",
    approvedBy: status === "active" ? user.id : null,
    approvedAt: status === "active" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(storeCustomers.id, id));
  await audit({ userId: user.id, action: "store.customer_status", entityType: "store_customer", entityId: id, metadata: { status } });
  revalidatePath("/web-store/customers");
}

// ---- Orders ---------------------------------------------------------------

export async function setOrderStatusAction(formData: FormData): Promise<void> {
  const user = await requireStoreEdit();
  const id = str(formData.get("id"));
  const status = str(formData.get("status")) as "pending" | "confirmed" | "fulfilled" | "canceled" | null;
  if (!id || !status || !["pending", "confirmed", "fulfilled", "canceled"].includes(status)) return;
  const order = await db.query.storeOrders.findFirst({ where: eq(storeOrders.id, id) });
  if (!order) return;

  // Stock: deduct line quantities when the order is confirmed; add them back if
  // a stock-applied order is later canceled. `stockApplied` makes it idempotent.
  const applyStock = status === "confirmed" && !order.stockApplied;
  const restoreStock = status === "canceled" && order.stockApplied;

  await db.transaction(async (tx) => {
    if (applyStock || restoreStock) {
      const lines = await tx.select({ qty: storeOrderItems.qty, invId: storeProducts.inventoryItemId })
        .from(storeOrderItems).leftJoin(storeProducts, eq(storeOrderItems.storeProductId, storeProducts.id))
        .where(eq(storeOrderItems.orderId, id));
      for (const l of lines) {
        if (!l.invId || !l.qty) continue;
        const item = await tx.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, l.invId), columns: { onHand: true } });
        if (!item) continue;
        const delta = applyStock ? -l.qty : l.qty;
        await tx.update(inventoryItems).set({ onHand: String(Number(item.onHand) + delta), updatedAt: new Date() }).where(eq(inventoryItems.id, l.invId));
        await tx.insert(stockMovements).values({ itemId: l.invId, delta: String(delta), reason: applyStock ? "consume" : "adjust", note: `Store order ${order.orderNumber}${applyStock ? "" : " (canceled)"}`, byUserId: user.id });
      }
    }
    await tx.update(storeOrders).set({
      status,
      stockApplied: applyStock ? true : restoreStock ? false : order.stockApplied,
      updatedAt: new Date(),
    }).where(eq(storeOrders.id, id));
  });

  await audit({ userId: user.id, action: "store.order_status", entityType: "store_order", entityId: id, metadata: { status, stock: applyStock ? "deducted" : restoreStock ? "restored" : "unchanged" } });
  revalidatePath("/web-store/orders");
  revalidatePath(`/web-store/orders/${id}`);
}
