"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fixedAssets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextDocNumber } from "@/lib/number-series";
import { runDepreciation, disposeAsset } from "./depreciation";

async function requireFinanceEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "0";
};
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function createAssetAction(formData: FormData): Promise<void> {
  const user = await requireFinanceEdit();
  const assetNumber = await nextDocNumber("fixed_asset", "FA-");
  const acq = date(formData.get("acquisitionDate"));
  const [a] = await db.insert(fixedAssets).values({
    assetNumber,
    name: str(formData.get("name")) ?? "New asset",
    category: str(formData.get("category")) ?? "equipment",
    description: str(formData.get("description")),
    acquisitionDate: acq,
    inServiceDate: date(formData.get("inServiceDate")) ?? acq,
    cost: money(formData.get("cost")),
    salvageValue: money(formData.get("salvageValue")),
    usefulLifeMonths: Math.max(1, Math.round(Number(formData.get("usefulLifeMonths")) || 60)),
    createdBy: user.id,
  }).returning({ id: fixedAssets.id });
  await audit({ userId: user.id, action: "asset.create", entityType: "fixed_asset", entityId: a.id });
  redirect(`/accounting/assets/${a.id}`);
}

export async function updateAssetAction(formData: FormData): Promise<void> {
  const user = await requireFinanceEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const acq = date(formData.get("acquisitionDate"));
  await db.update(fixedAssets).set({
    name: str(formData.get("name")) ?? "Asset",
    category: str(formData.get("category")) ?? "equipment",
    description: str(formData.get("description")),
    acquisitionDate: acq,
    inServiceDate: date(formData.get("inServiceDate")) ?? acq,
    cost: money(formData.get("cost")),
    salvageValue: money(formData.get("salvageValue")),
    usefulLifeMonths: Math.max(1, Math.round(Number(formData.get("usefulLifeMonths")) || 60)),
    notes: str(formData.get("notes")),
    updatedAt: new Date(),
  }).where(eq(fixedAssets.id, id));
  await audit({ userId: user.id, action: "asset.update", entityType: "fixed_asset", entityId: id });
  revalidatePath(`/accounting/assets/${id}`);
}

export async function disposeAssetAction(formData: FormData): Promise<void> {
  const user = await requireFinanceEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const proceeds = Number(money(formData.get("proceeds")));
  const when = date(formData.get("disposedDate")) ?? new Date();
  const res = await disposeAsset(id, proceeds, when, str(formData.get("note")) ?? "", user.id);
  await audit({ userId: user.id, action: "asset.dispose", entityType: "fixed_asset", entityId: id, metadata: { proceeds, ok: res.ok } });
  revalidatePath(`/accounting/assets/${id}`);
}

export async function runDepreciationAction(formData: FormData): Promise<void> {
  const user = await requireFinanceEdit();
  const periodYm = String(formData.get("periodYm") ?? "").trim();
  const res = await runDepreciation(periodYm, user.id);
  await audit({ userId: user.id, action: "asset.depreciation_run", entityType: "depreciation_run", entityId: periodYm, metadata: { ...res } });
  revalidatePath("/accounting/assets/depreciation");
}
