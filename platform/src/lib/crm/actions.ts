"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  businessPartners,
  contacts,
  activities,
  numberSeries,
  activityTypeEnum,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit, canView } from "@/lib/rbac";
import { audit } from "@/lib/audit";

async function requireCrmEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "crm")) redirect("/403");
  if (!canEdit(user.roles, "crm")) redirect("/403");
  return user;
}

/** Allocate the next BP number from the number series (e.g. BP-00001). */
async function nextBpNumber(): Promise<string> {
  return db.transaction(async (tx) => {
    let series = await tx.query.numberSeries.findFirst({
      where: eq(numberSeries.documentType, "business_partner"),
    });
    if (!series) {
      [series] = await tx
        .insert(numberSeries)
        .values({ documentType: "business_partner", prefix: "BP-", nextNumber: 1, padding: 5 })
        .returning();
    }
    const number = series.nextNumber;
    await tx
      .update(numberSeries)
      .set({ nextNumber: number + 1, updatedAt: new Date() })
      .where(eq(numberSeries.id, series.id));
    return `${series.prefix}${String(number).padStart(series.padding, "0")}`;
  });
}

export interface CrmState {
  error?: string;
}

const bpSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  accountGroupId: z.string().trim().min(1, "Account group is required"),
  primaryContactName: z.string().trim().min(1, "Primary contact name is required"),
  primaryContactEmail: z.string().trim().email("Valid primary contact email is required"),
  phone: z.string().trim().optional(),
  addressStreet: z.string().trim().optional(),
  addressCity: z.string().trim().optional(),
  addressState: z.string().trim().optional(),
  addressZip: z.string().trim().optional(),
  creditLimit: z.string().trim().optional(),
  paymentTerms: z.string().trim().optional(),
  internalNotes: z.string().trim().optional(),
});

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export async function createBusinessPartnerAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const user = await requireCrmEdit();
  const parsed = bpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const bpNumber = await nextBpNumber();
  const { firstName, lastName } = splitName(d.primaryContactName);

  const id = await db.transaction(async (tx) => {
    const [bp] = await tx
      .insert(businessPartners)
      .values({
        bpNumber,
        companyName: d.companyName,
        accountGroupId: d.accountGroupId,
        phone: d.phone || null,
        email: d.primaryContactEmail,
        addressStreet: d.addressStreet || null,
        addressCity: d.addressCity || null,
        addressState: d.addressState || null,
        addressZip: d.addressZip || null,
        creditLimit: d.creditLimit ? d.creditLimit : null,
        paymentTerms: d.paymentTerms || null,
        internalNotes: d.internalNotes || null,
        createdBy: user.id,
      })
      .returning({ id: businessPartners.id });
    await tx.insert(contacts).values({
      bpId: bp.id,
      firstName,
      lastName,
      email: d.primaryContactEmail,
      phone: d.phone || null,
      isPrimary: true,
    });
    await audit(
      { userId: user.id, action: "bp.create", entityType: "business_partner", entityId: bp.id, metadata: { bpNumber, companyName: d.companyName } },
      tx,
    );
    return bp.id;
  });

  revalidatePath("/crm");
  redirect(`/crm/${id}`);
}

export async function updateBusinessPartnerAction(_prev: CrmState, formData: FormData): Promise<CrmState> {
  const user = await requireCrmEdit();
  const id = String(formData.get("id") ?? "");
  const parsed = bpSchema
    .omit({ primaryContactName: true, primaryContactEmail: true })
    .extend({ email: z.string().trim().email().optional().or(z.literal("")) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  await db.transaction(async (tx) => {
    await tx
      .update(businessPartners)
      .set({
        companyName: d.companyName,
        accountGroupId: d.accountGroupId,
        phone: d.phone || null,
        email: d.email || null,
        addressStreet: d.addressStreet || null,
        addressCity: d.addressCity || null,
        addressState: d.addressState || null,
        addressZip: d.addressZip || null,
        creditLimit: d.creditLimit ? d.creditLimit : null,
        paymentTerms: d.paymentTerms || null,
        internalNotes: d.internalNotes || null,
        updatedAt: new Date(),
      })
      .where(eq(businessPartners.id, id));
    await audit({ userId: user.id, action: "bp.update", entityType: "business_partner", entityId: id }, tx);
  });

  revalidatePath(`/crm/${id}`);
  redirect(`/crm/${id}`);
}

export async function addContactAction(formData: FormData): Promise<void> {
  const user = await requireCrmEdit();
  const bpId = String(formData.get("bpId") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!bpId || (!firstName && !lastName)) return;
  const makePrimary = formData.get("isPrimary") === "on";

  await db.transaction(async (tx) => {
    if (makePrimary) {
      await tx.update(contacts).set({ isPrimary: false }).where(eq(contacts.bpId, bpId));
    }
    await tx.insert(contacts).values({
      bpId,
      firstName: firstName || null,
      lastName: lastName || null,
      title: String(formData.get("title") ?? "").trim() || null,
      email: email || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      isPrimary: makePrimary,
    });
    await audit({ userId: user.id, action: "contact.create", entityType: "business_partner", entityId: bpId }, tx);
  });
  revalidatePath(`/crm/${bpId}`);
}

export async function deleteContactAction(formData: FormData): Promise<void> {
  const user = await requireCrmEdit();
  const id = String(formData.get("id") ?? "");
  const bpId = String(formData.get("bpId") ?? "");
  if (!id) return;
  await db.delete(contacts).where(eq(contacts.id, id));
  await audit({ userId: user.id, action: "contact.delete", entityType: "business_partner", entityId: bpId });
  revalidatePath(`/crm/${bpId}`);
}

export async function addActivityAction(formData: FormData): Promise<void> {
  const user = await requireCrmEdit();
  const bpId = String(formData.get("bpId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "note");
  const type = (activityTypeEnum.enumValues as readonly string[]).includes(typeRaw)
    ? (typeRaw as (typeof activityTypeEnum.enumValues)[number])
    : "note";
  if (!bpId || !content) return;

  await db.insert(activities).values({ bpId, userId: user.id, type, content });
  await audit({ userId: user.id, action: "activity.create", entityType: "business_partner", entityId: bpId, metadata: { type } });
  revalidatePath(`/crm/${bpId}`);
}
