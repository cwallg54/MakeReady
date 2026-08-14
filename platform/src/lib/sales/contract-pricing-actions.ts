"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerPricing, catalogStyles, businessPartners } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function requireEdit() {
  const user = await getCurrentUser();
  const ok = user && (canEdit(user.roles, "crm") || canEdit(user.roles, "sales")) && canView(user.roles, "crm");
  if (!user || !ok) redirect("/403");
  return user;
}
const num = (v: FormDataEntryValue | null) => { const n = Number(String(v ?? "").replace(/[$,%]/g, "")); return Number.isFinite(n) ? n : 0; };
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function addContractRuleAction(bpId: string, formData: FormData) {
  const user = await requireEdit();
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId), columns: { id: true } });
  if (!bp) redirect("/crm");

  const type = String(formData.get("type") ?? "");
  if (type !== "pct_off" && type !== "fixed_unit") redirect(`/crm/${bpId}/pricing?e=type`);
  const value = num(formData.get("value"));
  if (value <= 0) redirect(`/crm/${bpId}/pricing?e=value`);
  if (type === "pct_off" && value > 100) redirect(`/crm/${bpId}/pricing?e=pct`);

  // Optional style scope by style number; blank = applies to every garment.
  let styleId: string | null = null;
  const styleNumber = str(formData.get("styleNumber"));
  if (styleNumber) {
    const s = await db.query.catalogStyles.findFirst({ where: eq(catalogStyles.styleNumber, styleNumber), columns: { id: true } });
    if (!s) redirect(`/crm/${bpId}/pricing?e=style`);
    styleId = s.id;
  }

  await db.insert(customerPricing).values({
    bpId, styleId, type, value: value.toFixed(4), note: str(formData.get("note")), createdBy: user.id,
  });
  await audit({ userId: user.id, action: "customer_pricing.add", entityType: "business_partner", entityId: bpId, metadata: { type, value, styleNumber } });
  revalidatePath(`/crm/${bpId}/pricing`);
}

export async function toggleContractRuleAction(bpId: string, ruleId: string, active: boolean) {
  await requireEdit();
  await db.update(customerPricing).set({ active }).where(eq(customerPricing.id, ruleId));
  revalidatePath(`/crm/${bpId}/pricing`);
}

export async function removeContractRuleAction(bpId: string, ruleId: string) {
  const user = await requireEdit();
  await db.delete(customerPricing).where(eq(customerPricing.id, ruleId));
  await audit({ userId: user.id, action: "customer_pricing.remove", entityType: "business_partner", entityId: bpId, metadata: { ruleId } });
  revalidatePath(`/crm/${bpId}/pricing`);
}
