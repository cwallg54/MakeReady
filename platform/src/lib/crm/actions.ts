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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const STAGE_LABEL: Record<string, string> = { lead: "Lead", prospect: "Prospect", customer: "Customer" };

/** Append a system-generated entry to a BP's activity feed (auto change log). */
async function logSystem(bpId: string, userId: string, content: string, tx?: Tx): Promise<void> {
  const runner = tx ?? db;
  await runner.insert(activities).values({ bpId, userId, content, type: "other", isSystem: true });
}

export interface CrmState {
  error?: string;
}

const bpSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  lifecycleStage: z.enum(["lead", "prospect", "customer"]).optional(),
  leadSource: z.string().trim().optional(),
  accountGroupId: z.string().trim().optional(),
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
        lifecycleStage: d.lifecycleStage ?? "lead",
        leadSource: d.leadSource || null,
        accountGroupId: d.accountGroupId || null,
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
    await logSystem(bp.id, user.id, `Created as ${STAGE_LABEL[d.lifecycleStage ?? "lead"]}`, tx);
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

  const current = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, id) });
  if (!current) return { error: "Business partner not found." };

  const newStage = d.lifecycleStage ?? current.lifecycleStage;
  const norm = (v: string | null | undefined) => (v == null || v === "" ? null : v);

  // Build the update. Finance fields are only written when present in the form,
  // so a Sales Rep (whose form omits them) never blanks them out.
  const set: Record<string, unknown> = {
    companyName: d.companyName,
    lifecycleStage: newStage,
    leadSource: d.leadSource || null,
    accountGroupId: d.accountGroupId || null,
    phone: d.phone || null,
    email: d.email || null,
    addressStreet: d.addressStreet || null,
    addressCity: d.addressCity || null,
    addressState: d.addressState || null,
    addressZip: d.addressZip || null,
    updatedAt: new Date(),
  };
  if (d.creditLimit !== undefined) set.creditLimit = d.creditLimit || null;
  if (d.paymentTerms !== undefined) set.paymentTerms = d.paymentTerms || null;
  if (d.internalNotes !== undefined) set.internalNotes = d.internalNotes || null;

  // Human-readable change list for the activity feed (no finance values exposed).
  const changes: string[] = [];
  if (current.companyName !== d.companyName) changes.push("company name");
  if (current.lifecycleStage !== newStage) changes.push(`stage to ${STAGE_LABEL[newStage]}`);
  if (norm(current.leadSource) !== norm(d.leadSource)) changes.push("lead source");
  if ((current.accountGroupId ?? null) !== (d.accountGroupId || null)) changes.push("account group");
  if (norm(current.email) !== norm(d.email)) changes.push("email");
  if (norm(current.phone) !== norm(d.phone)) changes.push("phone");
  if (
    norm(current.addressStreet) !== norm(d.addressStreet) ||
    norm(current.addressCity) !== norm(d.addressCity) ||
    norm(current.addressState) !== norm(d.addressState) ||
    norm(current.addressZip) !== norm(d.addressZip)
  ) changes.push("address");
  const financeChanged =
    (d.creditLimit !== undefined && norm(current.creditLimit) !== norm(d.creditLimit)) ||
    (d.paymentTerms !== undefined && norm(current.paymentTerms) !== norm(d.paymentTerms)) ||
    (d.internalNotes !== undefined && norm(current.internalNotes) !== norm(d.internalNotes));
  if (financeChanged) changes.push("account terms");

  await db.transaction(async (tx) => {
    await tx.update(businessPartners).set(set).where(eq(businessPartners.id, id));
    await audit({ userId: user.id, action: "bp.update", entityType: "business_partner", entityId: id, metadata: { changes } }, tx);
    if (changes.length > 0) {
      await logSystem(id, user.id, `Updated ${changes.join(", ")}`, tx);
    }
  });

  revalidatePath(`/crm/${id}`);
  redirect(`/crm/${id}`);
}

export async function setStageAction(formData: FormData): Promise<void> {
  const user = await requireCrmEdit();
  const id = String(formData.get("id") ?? "");
  const stageRaw = String(formData.get("stage") ?? "");
  if (!id || !["lead", "prospect", "customer"].includes(stageRaw)) return;
  const stage = stageRaw as "lead" | "prospect" | "customer";

  await db.update(businessPartners).set({ lifecycleStage: stage, updatedAt: new Date() }).where(eq(businessPartners.id, id));
  await audit({ userId: user.id, action: "bp.stage_change", entityType: "business_partner", entityId: id, metadata: { stage } });
  await logSystem(id, user.id, `Stage changed to ${STAGE_LABEL[stage]}`);
  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
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
    const label = [firstName, lastName].filter(Boolean).join(" ") || "a contact";
    await logSystem(bpId, user.id, `Added contact ${label}${makePrimary ? " (primary)" : ""}`, tx);
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
  await logSystem(bpId, user.id, "Removed a contact");
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
