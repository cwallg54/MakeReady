"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { baseDesigns, designItems, designBrands, designSuffixes, inventoryItems, numberSeries, businessPartners } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canDoArt } from "@/lib/art/access";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const MAX_IMG = 10 * 1024 * 1024;

async function requireArt() {
  const user = await getCurrentUser();
  if (!user || !canDoArt(user.roles)) redirect("/403");
  return user;
}
function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

/** Next value from a numbering series (created on demand). */
async function nextNumber(documentType: string, prefix: string, padding: number, start: number): Promise<string> {
  return db.transaction(async (tx) => {
    let s = await tx.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, documentType) });
    if (!s) [s] = await tx.insert(numberSeries).values({ documentType, prefix, nextNumber: start, padding }).returning();
    const n = s.nextNumber;
    await tx.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
    return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
  });
}

// ---- Base designs ---------------------------------------------------------

export async function createBaseDesignAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const name = str(formData.get("name"));
  if (!name) return;
  const brandCode = String(formData.get("brandCode") ?? "G54").trim() || "G54";
  const yr = Number(formData.get("releaseYear"));
  const manual = str(formData.get("baseNumber"));
  // ESM base numbers carry the ESM tag; G54 base numbers are the next sequence.
  const baseNumber = manual ?? (brandCode === "ESM" ? `ESM${await nextNumber("esm_base_design", "", 4, 1000)}` : await nextNumber("base_design", "", 4, 4500));
  const [row] = await db.insert(baseDesigns).values({
    baseNumber,
    name,
    brandCode,
    releaseYear: Number.isFinite(yr) && yr > 0 ? Math.round(yr) : null,
    notes: str(formData.get("notes")),
    createdBy: user.id,
  }).returning({ id: baseDesigns.id });
  await audit({ userId: user.id, action: "design.base_create", entityType: "base_design", entityId: row.id, metadata: { baseNumber } });
  redirect(`/designs/new?base=${row.id}`);
}

// ---- Design items (SKUs) --------------------------------------------------

/**
 * Create a design item. When it has both an item number and a barcode, it goes
 * "active" and auto-creates the inventory item (with the art image) so sales can
 * order it — otherwise it's saved as a draft (the ordering gate).
 */
export async function createDesignItemAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const brandCode = String(formData.get("brandCode") ?? "G54").trim() || "G54";
  const custNumber = str(formData.get("custNumber"))?.toUpperCase() ?? null;
  const designBase = str(formData.get("designBase"));
  const suffixEarly = str(formData.get("suffix"));
  const variantEarly = str(formData.get("colorVariant"));
  // Compose the full number if art didn't type one: CustNum-DesignBase[-suffix][variant].
  let itemNumber = str(formData.get("itemNumber"));
  if (!itemNumber && custNumber && designBase) {
    itemNumber = `${custNumber}-${designBase}${suffixEarly ? `-${suffixEarly}` : ""}${variantEarly ?? ""}`;
  }
  const barcodeSource = formData.get("barcodeSource") === "customer" ? "customer" : "gmw";
  let barcodeNumber = str(formData.get("barcodeNumber"));

  // New designs default to G54; choosing ESM (or a manual override) is an
  // exception that must be justified and appears on the exceptions report.
  const brand = await db.query.designBrands.findFirst({ where: eq(designBrands.code, brandCode) });
  const isException = !!brand?.isLegacy || formData.get("markException") === "on";
  const exceptionReason = str(formData.get("exceptionReason"));
  if (isException && !exceptionReason) redirect("/designs/new?err=exception");

  // Barcode: auto-assign a GMW 12-digit (052774 prefix), or take the customer's.
  if (barcodeSource === "gmw" && !barcodeNumber && itemNumber) {
    barcodeNumber = await nextNumber("gmw_barcode", "052774", 6, 200_000);
  }

  // Art image.
  const file = formData.get("image");
  let imageBase64: string | null = null;
  let imageMimeType: string | null = null;
  if (file instanceof File && file.size > 0 && file.size <= MAX_IMG && file.type.startsWith("image/")) {
    imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    imageMimeType = file.type;
  }

  const suffix = suffixEarly;
  const colorVariant = variantEarly;
  const description = str(formData.get("description"));

  // Orderable only when both the item number and barcode are present.
  const orderable = !!itemNumber && !!barcodeNumber;

  let inventoryItemId: string | null = null;
  if (orderable) {
    // Reuse an existing item with the same SKU, else create one carrying the art.
    const existing = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.sku, itemNumber!) });
    if (existing) {
      inventoryItemId = existing.id;
      if (imageBase64) await db.update(inventoryItems).set({ imageBase64, imageMimeType, updatedAt: new Date() }).where(eq(inventoryItems.id, existing.id));
    } else {
      const name = description || [designBase, colorVariant, suffix].filter(Boolean).join(" ") || itemNumber!;
      const [inv] = await db.insert(inventoryItems).values({
        sku: itemNumber!,
        name,
        category: brandCode,
        imageBase64,
        imageMimeType,
      }).returning({ id: inventoryItems.id });
      inventoryItemId = inv.id;
    }
  }

  const [row] = await db.insert(designItems).values({
    itemNumber: itemNumber ?? `DRAFT-${await nextNumber("design_draft", "", 5, 1)}`,
    custNumber,
    designBase,
    description,
    catalog: brandCode === "ESM" ? "esm" : "g54",
    brandCode,
    bpId: str(formData.get("bpId")),
    suffix,
    colorVariant,
    printing: str(formData.get("printing")),
    location: str(formData.get("location")),
    barcodeNumber,
    barcodeSource,
    imageBase64,
    imageMimeType,
    status: orderable ? "active" : "draft",
    isException,
    exceptionReason,
    inventoryItemId,
    createdBy: user.id,
  }).returning({ id: designItems.id });

  await audit({ userId: user.id, action: "design.item_create", entityType: "design_item", entityId: row.id, metadata: { itemNumber, orderable, isException } });
  revalidatePath("/designs");
  redirect(`/designs/${row.id}`);
}

/** Finalize a draft design item once its item number + barcode are filled. */
export async function activateDesignItemAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const item = await db.query.designItems.findFirst({ where: eq(designItems.id, id) });
  if (!item || item.status === "active") return;

  let itemNumber = item.itemNumber.startsWith("DRAFT-") ? str(formData.get("itemNumber")) : item.itemNumber;
  itemNumber = itemNumber ?? str(formData.get("itemNumber"));
  let barcodeNumber = item.barcodeNumber ?? str(formData.get("barcodeNumber"));
  if (!barcodeNumber && item.barcodeSource === "gmw" && itemNumber) barcodeNumber = await nextNumber("gmw_barcode", "", 12, 100_000_000_000);
  if (!itemNumber || !barcodeNumber) redirect(`/designs/${id}?err=gate`); // the ordering gate

  const base = item.baseDesignId ? await db.query.baseDesigns.findFirst({ where: eq(baseDesigns.id, item.baseDesignId) }) : null;
  const existing = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.sku, itemNumber) });
  let inventoryItemId = item.inventoryItemId;
  if (existing) {
    inventoryItemId = existing.id;
    if (item.imageBase64) await db.update(inventoryItems).set({ imageBase64: item.imageBase64, imageMimeType: item.imageMimeType, updatedAt: new Date() }).where(eq(inventoryItems.id, existing.id));
  } else {
    const name = [base?.name, item.colorVariant, item.suffix].filter(Boolean).join(" ") || itemNumber;
    const [inv] = await db.insert(inventoryItems).values({ sku: itemNumber, name, category: item.brandCode, imageBase64: item.imageBase64, imageMimeType: item.imageMimeType }).returning({ id: inventoryItems.id });
    inventoryItemId = inv.id;
  }
  await db.update(designItems).set({ itemNumber, barcodeNumber, status: "active", inventoryItemId, updatedAt: new Date() }).where(eq(designItems.id, id));
  await audit({ userId: user.id, action: "design.item_activate", entityType: "design_item", entityId: id, metadata: { itemNumber } });
  revalidatePath(`/designs/${id}`);
  revalidatePath("/designs");
}

// ---- Reference config (brands + suffixes) ---------------------------------

/**
 * Reconcile an unmatched customer number: link every design (and its barcodes)
 * carrying that CustNum to a chosen customer. Optionally backfill the customer's
 * legacy code so future imports match automatically.
 */
export async function linkCustomerNumberAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const custNumber = str(formData.get("custNumber"))?.toUpperCase();
  const bpId = str(formData.get("bpId"));
  if (!custNumber || !bpId) return;

  await db.update(designItems).set({ bpId, updatedAt: new Date() }).where(and(eq(designItems.custNumber, custNumber), isNull(designItems.bpId)));

  // Backfill the legacy code (C + custNumber) if the account has none, so a
  // re-import of the book matches this customer without manual linking.
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId), columns: { legacyCode: true } });
  if (bp && !bp.legacyCode) {
    await db.update(businessPartners).set({ legacyCode: `C${custNumber}`, updatedAt: new Date() }).where(eq(businessPartners.id, bpId)).catch(() => {});
  }
  await audit({ userId: user.id, action: "design.link_customer", entityType: "business_partner", entityId: bpId, metadata: { custNumber } });
  revalidatePath("/designs/reconcile");
}

export async function addSuffixAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) redirect("/403");
  const code = str(formData.get("code"))?.toUpperCase();
  const label = str(formData.get("label"));
  if (!code || !label) return;
  await db.insert(designSuffixes).values({ code, label, kind: String(formData.get("kind") ?? "product") }).onConflictDoNothing({ target: designSuffixes.code });
  revalidatePath("/designs/config");
}

export async function toggleSuffixAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) redirect("/403");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const s = await db.query.designSuffixes.findFirst({ where: eq(designSuffixes.id, id) });
  if (s) await db.update(designSuffixes).set({ active: !s.active }).where(eq(designSuffixes.id, id));
  revalidatePath("/designs/config");
}
