"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { baseDesigns, designItems, designBrands, designSuffixes, inventoryItems, numberSeries, businessPartners, artRequests, orderAttachments } from "@/db/schema";
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

// ---- Design artwork image -------------------------------------------------

/** Attach (or replace) the artwork image on a design. Building up these images
 *  is what makes visual/image search possible over time. */
export async function uploadDesignImageAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const file = formData.get("file");
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (f.size > 0 && f.size <= MAX_IMG && f.type.startsWith("image/")) {
      const buf = Buffer.from(await f.arrayBuffer());
      await db.update(designItems).set({ imageBase64: buf.toString("base64"), imageMimeType: f.type, updatedAt: new Date() }).where(eq(designItems.id, id));
      await audit({ userId: user.id, action: "design.image_upload", entityType: "design_item", entityId: id });
    }
  }
  revalidatePath(`/designs/${id}`);
}

/** Remove a design's artwork image. */
export async function removeDesignImageAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(designItems).set({ imageBase64: null, imageMimeType: null, updatedAt: new Date() }).where(eq(designItems.id, id));
  await audit({ userId: user.id, action: "design.image_remove", entityType: "design_item", entityId: id });
  revalidatePath(`/designs/${id}`);
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
 * Compose + persist a design item from a form. Shared by the standalone
 * "+ New design" flow and the art-order flow. When it has both an item number
 * and a barcode it goes "active" and auto-creates the inventory item (carrying
 * the art image) so sales can order it — otherwise it's a draft (the gate).
 * Returns the new row plus what the caller needs to wire it onward.
 */
async function composeDesignFromForm(
  user: { id: string },
  formData: FormData,
): Promise<{ id: string; itemNumber: string; orderable: boolean; imageBase64: string | null; imageMimeType: string | null; inventoryItemId: string | null } | { err: string }> {
  const brandCode = String(formData.get("brandCode") ?? "G54").trim() || "G54";
  const custNumber = str(formData.get("custNumber"))?.toUpperCase() ?? null;
  const designBase = str(formData.get("designBase"));
  const suffixEarly = str(formData.get("suffix"));
  const variantEarly = str(formData.get("colorVariant"));
  let itemNumber = str(formData.get("itemNumber"));
  if (!itemNumber && custNumber && designBase) {
    itemNumber = `${custNumber}-${designBase}${suffixEarly ? `-${suffixEarly}` : ""}${variantEarly ?? ""}`;
  }
  const barcodeSource = formData.get("barcodeSource") === "customer" ? "customer" : "gmw";
  let barcodeNumber = str(formData.get("barcodeNumber"));

  const brand = await db.query.designBrands.findFirst({ where: eq(designBrands.code, brandCode) });
  const isException = !!brand?.isLegacy || formData.get("markException") === "on";
  const exceptionReason = str(formData.get("exceptionReason"));
  if (isException && !exceptionReason) return { err: "exception" };

  if (barcodeSource === "gmw" && !barcodeNumber && itemNumber) {
    barcodeNumber = await nextNumber("gmw_barcode", "052774", 6, 200_000);
  }

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
  const orderable = !!itemNumber && !!barcodeNumber;

  let inventoryItemId: string | null = null;
  if (orderable) {
    const existing = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.sku, itemNumber!) });
    if (existing) {
      inventoryItemId = existing.id;
      if (imageBase64) await db.update(inventoryItems).set({ imageBase64, imageMimeType, updatedAt: new Date() }).where(eq(inventoryItems.id, existing.id));
    } else {
      const name = description || [designBase, colorVariant, suffix].filter(Boolean).join(" ") || itemNumber!;
      const [inv] = await db.insert(inventoryItems).values({ sku: itemNumber!, name, category: brandCode, imageBase64, imageMimeType }).returning({ id: inventoryItems.id });
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
  return { id: row.id, itemNumber: itemNumber ?? row.id, orderable, imageBase64, imageMimeType, inventoryItemId };
}

/**
 * Create a design item. When it has both an item number and a barcode, it goes
 * "active" and auto-creates the inventory item (with the art image) so sales can
 * order it — otherwise it's saved as a draft (the ordering gate).
 */
export async function createDesignItemAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const res = await composeDesignFromForm(user, formData);
  if ("err" in res) redirect(`/designs/new?err=${res.err}`);
  revalidatePath("/designs");
  redirect(`/designs/${res.id}`);
}

/**
 * Create a design straight from an art job. Same composition + auto-item, but it
 * links the design back to the art request (the required gate) and attaches the
 * art image onto the order so the proof/order already carries it. This is the
 * "art punches it in once and it flows to items" wiring from the process review.
 */
export async function createDesignForArtAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const requestId = str(formData.get("requestId"));
  const orderId = str(formData.get("orderId"));
  if (!requestId) return;
  const res = await composeDesignFromForm(user, formData);
  if ("err" in res) redirect(`/art/${requestId}?err=${res.err}`);

  await db.update(artRequests).set({ designItemId: res.id, updatedAt: new Date() }).where(eq(artRequests.id, requestId));

  // Carry the art onto the order so the proof/order already has it attached.
  if (orderId && res.imageBase64 && res.imageMimeType) {
    await db.insert(orderAttachments).values({
      orderId,
      filename: `${res.itemNumber}.${res.imageMimeType.split("/")[1] ?? "png"}`,
      mimeType: res.imageMimeType,
      sizeBytes: Math.round((res.imageBase64.length * 3) / 4),
      kind: "art",
      contentBase64: res.imageBase64,
      notes: `Design ${res.itemNumber} (art department)`,
      uploadedBy: user.id,
    });
  }
  await audit({ userId: user.id, action: "art.design_create", entityType: "art_request", entityId: requestId, metadata: { designItemId: res.id, orderable: res.orderable } });
  revalidatePath(`/art/${requestId}`);
  revalidatePath("/designs");
  redirect(`/art/${requestId}`);
}

/**
 * Edit / complete a design already linked to an art job — the full inline edit.
 * Updates every field, (re)composes the number, keeps or replaces the art, and
 * once it has an item number + barcode it activates and creates the orderable
 * inventory item. Lets art finish a draft without leaving the art request.
 */
export async function completeDesignForArtAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const requestId = str(formData.get("requestId"));
  const orderId = str(formData.get("orderId"));
  const designItemId = str(formData.get("designItemId"));
  if (!requestId || !designItemId) return;
  const existing = await db.query.designItems.findFirst({ where: eq(designItems.id, designItemId) });
  if (!existing) redirect(`/art/${requestId}?err=nolink`);

  const brandCode = String(formData.get("brandCode") ?? existing.brandCode ?? "G54").trim() || "G54";
  const custNumber = str(formData.get("custNumber"))?.toUpperCase() ?? null;
  const designBase = str(formData.get("designBase"));
  const suffix = str(formData.get("suffix"));
  const colorVariant = str(formData.get("colorVariant"));
  const description = str(formData.get("description"));

  // Item number: explicit field wins; else compose; else keep the real one (not the DRAFT- placeholder).
  let itemNumber = str(formData.get("itemNumber"));
  if (!itemNumber && custNumber && designBase) {
    itemNumber = `${custNumber}-${designBase}${suffix ? `-${suffix}` : ""}${colorVariant ?? ""}`;
  }
  if (!itemNumber && !existing.itemNumber.startsWith("DRAFT-")) itemNumber = existing.itemNumber;

  const brand = await db.query.designBrands.findFirst({ where: eq(designBrands.code, brandCode) });
  const isException = !!brand?.isLegacy || formData.get("markException") === "on";
  const exceptionReason = str(formData.get("exceptionReason")) ?? existing.exceptionReason;
  if (isException && !exceptionReason) redirect(`/art/${requestId}?err=exception`);

  const barcodeSource = formData.get("barcodeSource") === "customer" ? "customer" : "gmw";
  let barcodeNumber = str(formData.get("barcodeNumber")) ?? existing.barcodeNumber;
  if (barcodeSource === "gmw" && !barcodeNumber && itemNumber) {
    barcodeNumber = await nextNumber("gmw_barcode", "052774", 6, 200_000);
  }

  // New image replaces the old; otherwise keep what's on the draft.
  const file = formData.get("image");
  let imageBase64 = existing.imageBase64;
  let imageMimeType = existing.imageMimeType;
  let newImage = false;
  if (file instanceof File && file.size > 0 && file.size <= MAX_IMG && file.type.startsWith("image/")) {
    imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    imageMimeType = file.type;
    newImage = true;
  }

  const orderable = !!itemNumber && !!barcodeNumber;
  let inventoryItemId = existing.inventoryItemId;
  if (orderable) {
    const inv = await db.query.inventoryItems.findFirst({ where: eq(inventoryItems.sku, itemNumber!) });
    if (inv) {
      inventoryItemId = inv.id;
      if (imageBase64) await db.update(inventoryItems).set({ imageBase64, imageMimeType, updatedAt: new Date() }).where(eq(inventoryItems.id, inv.id));
    } else {
      const name = description || [designBase, colorVariant, suffix].filter(Boolean).join(" ") || itemNumber!;
      const [created] = await db.insert(inventoryItems).values({ sku: itemNumber!, name, category: brandCode, imageBase64, imageMimeType }).returning({ id: inventoryItems.id });
      inventoryItemId = created.id;
    }
  }

  await db.update(designItems).set({
    itemNumber: itemNumber ?? existing.itemNumber,
    custNumber: custNumber ?? existing.custNumber,
    designBase: designBase ?? existing.designBase,
    description,
    catalog: brandCode === "ESM" ? "esm" : "g54",
    brandCode,
    bpId: str(formData.get("bpId")) ?? existing.bpId,
    suffix,
    colorVariant,
    printing: str(formData.get("printing")) ?? existing.printing,
    location: str(formData.get("location")) ?? existing.location,
    barcodeNumber,
    barcodeSource,
    imageBase64,
    imageMimeType,
    status: orderable ? "active" : "draft",
    isException,
    exceptionReason,
    inventoryItemId,
    updatedAt: new Date(),
  }).where(eq(designItems.id, designItemId));

  // Carry a freshly-uploaded art image onto the order for the proof.
  if (orderId && newImage && imageBase64 && imageMimeType) {
    await db.insert(orderAttachments).values({
      orderId,
      filename: `${itemNumber ?? existing.itemNumber}.${imageMimeType.split("/")[1] ?? "png"}`,
      mimeType: imageMimeType,
      sizeBytes: Math.round((imageBase64.length * 3) / 4),
      kind: "art",
      contentBase64: imageBase64,
      notes: `Design ${itemNumber ?? existing.itemNumber} (art department)`,
      uploadedBy: user.id,
    });
  }
  await audit({ userId: user.id, action: "art.design_complete", entityType: "art_request", entityId: requestId, metadata: { designItemId, orderable } });
  revalidatePath(`/art/${requestId}`);
  revalidatePath(`/designs/${designItemId}`);
  revalidatePath("/designs");
  redirect(`/art/${requestId}`);
}

/** Detach the design from an art job (e.g. linked the wrong one). */
export async function unlinkDesignFromArtAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const requestId = str(formData.get("requestId"));
  if (!requestId) return;
  await db.update(artRequests).set({ designItemId: null, updatedAt: new Date() }).where(eq(artRequests.id, requestId));
  await audit({ userId: user.id, action: "art.design_unlink", entityType: "art_request", entityId: requestId });
  revalidatePath(`/art/${requestId}`);
}

/** Link an already-existing design to an art job (reused artwork). */
export async function linkExistingDesignToArtAction(formData: FormData): Promise<void> {
  const user = await requireArt();
  const requestId = str(formData.get("requestId"));
  const itemNumber = str(formData.get("itemNumber"))?.toUpperCase();
  if (!requestId || !itemNumber) return;
  const design = await db.query.designItems.findFirst({ where: eq(designItems.itemNumber, itemNumber) });
  if (!design) redirect(`/art/${requestId}?err=nolink`);
  await db.update(artRequests).set({ designItemId: design.id, updatedAt: new Date() }).where(eq(artRequests.id, requestId));
  await audit({ userId: user.id, action: "art.design_link", entityType: "art_request", entityId: requestId, metadata: { designItemId: design.id } });
  revalidatePath(`/art/${requestId}`);
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
