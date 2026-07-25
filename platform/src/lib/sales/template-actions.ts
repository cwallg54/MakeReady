"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderFormTemplates, templateItems } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { audit } from "@/lib/audit";
import { sellPrice, type ChargeRule, type ChargeType } from "./pricing";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes("admin")) redirect("/403");
  return user;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface TemplateState {
  error?: string;
}

export async function createTemplateAction(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  const admin = await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  const slug = slugify(name);
  const existing = await db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.slug, slug) });
  if (existing) return { error: "A template with a similar name already exists." };

  const sizes = String(formData.get("sizeOptions") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const [t] = await db
    .insert(orderFormTemplates)
    .values({
      name,
      slug,
      description: String(formData.get("description") ?? "").trim() || null,
      sizeOptions: sizes.length ? sizes : null,
      charges: [],
    })
    .returning({ id: orderFormTemplates.id });
  await audit({ userId: admin.id, action: "template.create", entityType: "order_form_template", entityId: t.id, metadata: { name } });
  redirect(`/admin/templates/${t.id}`);
}

export async function updateTemplateMetaAction(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Name is required." };
  const sizes = String(formData.get("sizeOptions") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const defaultMarkupPct = Number(formData.get("defaultMarkupPct") ?? 0) || 0;
  await db
    .update(orderFormTemplates)
    .set({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      sizeOptions: sizes.length ? sizes : null,
      defaultMarkupPct: String(defaultMarkupPct),
      active: formData.get("active") === "on",
      updatedAt: new Date(),
    })
    .where(eq(orderFormTemplates.id, id));

  // Recompute sell price for items that inherit the template default markup.
  const items = await db.select().from(templateItems).where(eq(templateItems.templateId, id));
  for (const it of items) {
    if (it.markupPct === null) {
      const price = sellPrice(Number(it.supplierCost), defaultMarkupPct);
      await db.update(templateItems).set({ unitPrice: String(price) }).where(eq(templateItems.id, it.id));
    }
  }
  await audit({ userId: admin.id, action: "template.update", entityType: "order_form_template", entityId: id });
  revalidatePath(`/admin/templates/${id}`);
  return {};
}

export async function addChargeAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const t = await db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.id, id) });
  if (!t) return;
  const label = String(formData.get("label") ?? "").trim();
  const type = String(formData.get("type") ?? "flat") as ChargeType;
  if (!label) return;
  const rules = ((t.charges as ChargeRule[] | null) ?? []).slice();
  let key = slugify(label);
  while (rules.some((r) => r.key === key)) key += "-1";
  rules.push({
    key,
    label,
    type,
    rate: Number(formData.get("rate") ?? 0) || 0,
    unit: String(formData.get("unit") ?? "").trim() || undefined,
    appliesWhen: (String(formData.get("appliesWhen") ?? "always") as ChargeRule["appliesWhen"]),
  });
  await db.update(orderFormTemplates).set({ charges: rules, updatedAt: new Date() }).where(eq(orderFormTemplates.id, id));
  await audit({ userId: admin.id, action: "template.charge_add", entityType: "order_form_template", entityId: id, metadata: { label } });
  revalidatePath(`/admin/templates/${id}`);
}

export async function removeChargeAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const key = String(formData.get("key") ?? "");
  const t = await db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.id, id) });
  if (!t) return;
  const rules = ((t.charges as ChargeRule[] | null) ?? []).filter((r) => r.key !== key);
  await db.update(orderFormTemplates).set({ charges: rules, updatedAt: new Date() }).where(eq(orderFormTemplates.id, id));
  await audit({ userId: admin.id, action: "template.charge_remove", entityType: "order_form_template", entityId: id });
  revalidatePath(`/admin/templates/${id}`);
}

export async function addItemAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  const template = await db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.id, id) });
  if (!template) return;

  const supplierCost = Number(formData.get("supplierCost") ?? 0) || 0;
  const markupRaw = String(formData.get("markupPct") ?? "").trim();
  const markupPct = markupRaw === "" ? null : Number(markupRaw) || 0;
  const effMarkup = markupPct ?? Number(template.defaultMarkupPct);
  await db.insert(templateItems).values({
    templateId: id,
    code: String(formData.get("code") ?? "").trim() || null,
    name,
    supplierCost: String(supplierCost),
    markupPct: markupPct === null ? null : String(markupPct),
    unitPrice: String(sellPrice(supplierCost, effMarkup)),
  });
  await audit({ userId: admin.id, action: "template.item_add", entityType: "order_form_template", entityId: id, metadata: { name } });
  revalidatePath(`/admin/templates/${id}`);
}

export async function updateItemAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const template = await db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.id, id) });
  if (!template || !itemId) return;

  const supplierCost = Number(formData.get("supplierCost") ?? 0) || 0;
  const markupRaw = String(formData.get("markupPct") ?? "").trim();
  const markupPct = markupRaw === "" ? null : Number(markupRaw) || 0;
  const effMarkup = markupPct ?? Number(template.defaultMarkupPct);
  await db
    .update(templateItems)
    .set({
      supplierCost: String(supplierCost),
      markupPct: markupPct === null ? null : String(markupPct),
      unitPrice: String(sellPrice(supplierCost, effMarkup)),
    })
    .where(and(eq(templateItems.id, itemId), eq(templateItems.templateId, id)));
  await audit({ userId: admin.id, action: "template.item_update", entityType: "order_form_template", entityId: id });
  revalidatePath(`/admin/templates/${id}`);
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  await db.delete(templateItems).where(and(eq(templateItems.id, itemId), eq(templateItems.templateId, id)));
  await audit({ userId: admin.id, action: "template.item_remove", entityType: "order_form_template", entityId: id });
  revalidatePath(`/admin/templates/${id}`);
}
