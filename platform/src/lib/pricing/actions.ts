"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pricingGarments, pricingExtras, pricingVendorFreight, pricingRoyalties } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { priceLine, getMethod, type PriceRequest, type PricedLine } from "./service";
import { dtfSurchargePerPiece, type DtfConfig, type DtfResult } from "./engine";

async function requireAdminUser() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) redirect("/403");
  return user;
}

const money = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const num = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(num) ? String(num) : null;
};

export async function upsertGarmentAction(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const garmentNumber = String(formData.get("garmentNumber") ?? "").trim();
  if (!garmentNumber) return;
  const cost = money(formData.get("cost")) ?? "0";
  const supplier = String(formData.get("supplier") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  await db
    .insert(pricingGarments)
    .values({ garmentNumber, cost, supplier, description, updatedAt: new Date() })
    .onConflictDoUpdate({ target: pricingGarments.garmentNumber, set: { cost, supplier, description, updatedAt: new Date() } });
  await audit({ userId: user.id, action: "pricing.garment_upsert", entityType: "pricing_garment", entityId: garmentNumber, metadata: { cost } });
  revalidatePath("/admin/pricing");
}

export async function deleteGarmentAction(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(pricingGarments).set({ active: false, updatedAt: new Date() }).where(eq(pricingGarments.id, id));
  await audit({ userId: user.id, action: "pricing.garment_deactivate", entityType: "pricing_garment", entityId: id });
  revalidatePath("/admin/pricing");
}

export async function updateExtraAction(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(pricingExtras).set({ amount: money(formData.get("amount")), manualQuote: money(formData.get("amount")) == null }).where(eq(pricingExtras.id, id));
  await audit({ userId: user.id, action: "pricing.extra_update", entityType: "pricing_extra", entityId: id });
  revalidatePath("/admin/pricing");
}

export async function updateFreightAction(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db
    .update(pricingVendorFreight)
    .set({ addPerGarment: money(formData.get("addPerGarment")), freeOverCost: money(formData.get("freeOverCost")), underThreshold: money(formData.get("underThreshold")) })
    .where(eq(pricingVendorFreight.id, id));
  await audit({ userId: user.id, action: "pricing.freight_update", entityType: "pricing_freight", entityId: id });
  revalidatePath("/admin/pricing");
}

export async function updateRoyaltyAction(formData: FormData): Promise<void> {
  const user = await requireAdminUser();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const pct = money(formData.get("pct")) ?? "0";
  if (id) {
    await db.update(pricingRoyalties).set({ pct }).where(eq(pricingRoyalties.id, id));
  } else if (name) {
    await db.insert(pricingRoyalties).values({ name, pct }).onConflictDoUpdate({ target: pricingRoyalties.name, set: { pct } });
  }
  await audit({ userId: user.id, action: "pricing.royalty_update", entityType: "pricing_royalty", entityId: id || name });
  revalidatePath("/admin/pricing");
}

export interface PriceState {
  result?: PricedLine;
  error?: string;
  echo?: Record<string, string>;
}

export interface DtfState {
  result?: DtfResult;
  error?: string;
}

/** DTF transfer surcharge preview (per-piece $ to add to a garment line). */
export async function calcDtfAction(_prev: DtfState, formData: FormData): Promise<DtfState> {
  try {
    const method = await getMethod("dtf");
    if (!method) return { error: "DTF pricing isn’t configured yet." };
    const widthIn = Number(formData.get("widthIn") ?? 0);
    const heightIn = Number(formData.get("heightIn") ?? 0);
    const qty = Math.round(Number(formData.get("qty") ?? 0));
    if (!(widthIn > 0) || !(heightIn > 0) || !(qty > 0)) return { error: "Enter width, height and quantity." };
    return { result: dtfSurchargePerPiece({ widthIn, heightIn, qty }, method.config as DtfConfig) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not price the DTF transfer." };
  }
}

/** Live price preview used by the admin calculator (and reusable by the quote builder). */
export async function calcPriceAction(_prev: PriceState, formData: FormData): Promise<PriceState> {
  try {
    const methodKey = (String(formData.get("methodKey") ?? "silkscreen") as "silkscreen" | "embroidery");
    const qty = Math.max(1, Math.round(Number(formData.get("qty") ?? 0)));
    if (!qty) return { error: "Enter a quantity." };
    const garmentNumber = String(formData.get("garmentNumber") ?? "").trim() || undefined;
    const garmentCostRaw = String(formData.get("garmentCost") ?? "").trim();
    const req: PriceRequest = {
      methodKey,
      qty,
      garmentNumber,
      garmentCost: garmentCostRaw ? Number(garmentCostRaw.replace(/[$,]/g, "")) : undefined,
      level: (String(formData.get("level") ?? "A") as "A" | "B" | "C"),
      stitch1: Number(formData.get("stitch1") ?? 0) || undefined,
      stitch2: Number(formData.get("stitch2") ?? 0) || undefined,
      leftChestYoke: formData.get("leftChestYoke") === "on",
      sleeve: formData.get("sleeve") === "on",
      allOverStain: formData.get("allOverStain") === "on",
      newDigitizing: formData.get("newDigitizing") === "on",
      extraIds: formData.getAll("extraIds").map(String),
      royaltyName: String(formData.get("royaltyName") ?? "None"),
      tier: (String(formData.get("tier") ?? "list") as PriceRequest["tier"]),
      freightVendor: String(formData.get("freightVendor") ?? "") || undefined,
    };
    if (!req.garmentNumber && !req.garmentCost) return { error: "Pick a garment or enter a garment cost." };
    const result = await priceLine(req);
    return { result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not price this line." };
  }
}
