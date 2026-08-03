"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  catalogStyles,
  catalogColors,
  decorationMethods,
  printLocations,
  colorTiers,
  embroideryTiers,
  sizeClasses,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { audit } from "@/lib/audit";
import type { DecorationPricing, SizeEntry } from "@/lib/sales/pricing";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes("admin")) redirect("/403");
  return user;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}
function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
/** Parse "S,M,L,2XL:2,3XL:3" into [{size, upcharge}]. */
function parseSizes(s: string): SizeEntry[] {
  return s
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [size, up] = chunk.split(":").map((x) => x.trim());
      return { size, upcharge: up ? Number(up) || 0 : 0 };
    })
    .filter((e) => e.size);
}

const CATALOG = "/admin/catalog";
const PRICING = "/admin/catalog/pricing";

// ---- Garment styles + colors ---------------------------------------------

export async function createStyleAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const name = str(formData.get("name"));
  if (!name) return;
  const [row] = await db.insert(catalogStyles).values({
    brand: str(formData.get("brand")),
    styleNumber: str(formData.get("styleNumber")),
    name,
    category: str(formData.get("category")),
    sizeClassCode: str(formData.get("sizeClassCode")),
    basePrice: String(num(formData.get("basePrice"))),
    supplierCost: str(formData.get("supplierCost")) ? String(num(formData.get("supplierCost"))) : null,
  }).returning({ id: catalogStyles.id });
  await audit({ userId: admin.id, action: "catalog.style_create", entityType: "catalog_style", entityId: row.id, metadata: { name } });
  redirect(`${CATALOG}/${row.id}`);
}

export async function updateStyleAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(catalogStyles).set({
    brand: str(formData.get("brand")),
    styleNumber: str(formData.get("styleNumber")),
    name: str(formData.get("name")) ?? "(unnamed)",
    category: str(formData.get("category")),
    sizeClassCode: str(formData.get("sizeClassCode")),
    basePrice: String(num(formData.get("basePrice"))),
    supplierCost: str(formData.get("supplierCost")) ? String(num(formData.get("supplierCost"))) : null,
    active: formData.get("active") === "on",
  }).where(eq(catalogStyles.id, id));
  await audit({ userId: admin.id, action: "catalog.style_update", entityType: "catalog_style", entityId: id });
  revalidatePath(`${CATALOG}/${id}`);
  revalidatePath(CATALOG);
}

export async function deleteStyleAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(catalogStyles).where(eq(catalogStyles.id, id));
  await audit({ userId: admin.id, action: "catalog.style_delete", entityType: "catalog_style", entityId: id });
  redirect(CATALOG);
}

export async function addColorAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const styleId = String(formData.get("styleId") ?? "");
  const name = str(formData.get("name"));
  if (!styleId || !name) return;
  await db.insert(catalogColors).values({ styleId, name, tierCode: str(formData.get("tierCode")), hex: str(formData.get("hex")) });
  await audit({ userId: admin.id, action: "catalog.color_add", entityType: "catalog_style", entityId: styleId });
  revalidatePath(`${CATALOG}/${styleId}`);
}

export async function deleteColorAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const styleId = String(formData.get("styleId") ?? "");
  if (!id) return;
  await db.delete(catalogColors).where(eq(catalogColors.id, id));
  revalidatePath(`${CATALOG}/${styleId}`);
}

// ---- Decoration methods ---------------------------------------------------

export async function saveMethodAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const pricing: DecorationPricing = {
    setupPerColorNew: num(formData.get("setupPerColorNew")),
    setupPerColorReorder: num(formData.get("setupPerColorReorder")),
    flatSetup: num(formData.get("flatSetup")),
    runPerColorPerUnit: num(formData.get("runPerColorPerUnit")),
    darkUpchargePerUnit: num(formData.get("darkUpchargePerUnit")),
  };
  await db.update(decorationMethods).set({
    name: str(formData.get("name")) ?? "(method)",
    priceMode: formData.get("priceMode") === "stitch" ? "stitch" : "per_color",
    pricing,
    active: formData.get("active") === "on",
  }).where(eq(decorationMethods.id, id));
  await audit({ userId: admin.id, action: "catalog.method_save", entityType: "decoration_method", entityId: id });
  revalidatePath(PRICING);
}

export async function createMethodAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const name = str(formData.get("name"));
  if (!name) return;
  await db.insert(decorationMethods).values({
    code: slug(name),
    name,
    priceMode: formData.get("priceMode") === "stitch" ? "stitch" : "per_color",
    pricing: {},
  }).onConflictDoNothing({ target: decorationMethods.code });
  await audit({ userId: admin.id, action: "catalog.method_create", entityType: "decoration_method", entityId: slug(name) });
  revalidatePath(PRICING);
}

// ---- Print locations ------------------------------------------------------

export async function addLocationAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const name = str(formData.get("name"));
  if (!name) return;
  const [{ max }] = await db.select({ max: sqlMax() }).from(printLocations);
  await db.insert(printLocations).values({ code: slug(name), name, sortOrder: (max ?? 0) + 1 }).onConflictDoNothing({ target: printLocations.code });
  await audit({ userId: admin.id, action: "catalog.location_add", entityType: "print_location", entityId: slug(name) });
  revalidatePath(PRICING);
}

export async function deleteLocationAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(printLocations).where(eq(printLocations.id, id));
  revalidatePath(PRICING);
}

// ---- Color tiers ----------------------------------------------------------

export async function addColorTierAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const name = str(formData.get("name"));
  if (!name) return;
  await db.insert(colorTiers).values({ code: slug(name), name }).onConflictDoNothing({ target: colorTiers.code });
  revalidatePath(PRICING);
}

export async function deleteColorTierAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(colorTiers).where(eq(colorTiers.id, id));
  revalidatePath(PRICING);
}

// ---- Embroidery tiers -----------------------------------------------------

export async function saveEmbTierAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const name = str(formData.get("name")) ?? "(tier)";
  const maxStitches = Math.round(num(formData.get("maxStitches")));
  const pricePerUnit = String(num(formData.get("pricePerUnit")));
  if (id) {
    await db.update(embroideryTiers).set({ name, maxStitches, pricePerUnit }).where(eq(embroideryTiers.id, id));
  } else {
    const code = str(formData.get("code")) ?? slug(name);
    await db.insert(embroideryTiers).values({ code, name, maxStitches, pricePerUnit }).onConflictDoNothing({ target: embroideryTiers.code });
  }
  revalidatePath(PRICING);
}

export async function deleteEmbTierAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(embroideryTiers).where(eq(embroideryTiers.id, id));
  revalidatePath(PRICING);
}

// ---- Size classes ---------------------------------------------------------

export async function saveSizeClassAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const name = str(formData.get("name")) ?? "(class)";
  const sizes = parseSizes(String(formData.get("sizes") ?? ""));
  if (id) {
    await db.update(sizeClasses).set({ name, sizes }).where(eq(sizeClasses.id, id));
  } else {
    const code = str(formData.get("code")) ?? slug(name);
    await db.insert(sizeClasses).values({ code, name, sizes }).onConflictDoNothing({ target: sizeClasses.code });
  }
  revalidatePath(PRICING);
}

export async function deleteSizeClassAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(sizeClasses).where(eq(sizeClasses.id, id));
  revalidatePath(PRICING);
}

function sqlMax() {
  return sql<number>`coalesce(max(${printLocations.sortOrder}), 0)`;
}
