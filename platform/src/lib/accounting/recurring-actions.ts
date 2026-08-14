"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recurringJournals, recurringJournalLines } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { postRecurringTemplate } from "./recurring";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "accounting") || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}
const money = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "0";
};
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

export async function createRecurringAction(): Promise<void> {
  const user = await requireAccountingEdit();
  const [t] = await db.insert(recurringJournals).values({ name: "New recurring entry", createdBy: user.id }).returning({ id: recurringJournals.id });
  await audit({ userId: user.id, action: "recurring.create", entityType: "recurring_journal", entityId: t.id });
  redirect(`/accounting/recurring/${t.id}`);
}

export async function updateRecurringMetaAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const day = Math.min(28, Math.max(1, Math.round(Number(formData.get("dayOfMonth") ?? 1)) || 1));
  await db.update(recurringJournals).set({
    name: str(formData.get("name")) ?? "Recurring entry",
    dayOfMonth: day,
    memo: str(formData.get("memo")),
    active: formData.get("active") === "on",
    updatedAt: new Date(),
  }).where(eq(recurringJournals.id, id));
  await audit({ userId: user.id, action: "recurring.meta", entityType: "recurring_journal", entityId: id });
  revalidatePath(`/accounting/recurring/${id}`);
}

export async function addRecurringLineAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const templateId = String(formData.get("templateId") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!templateId || !accountId) return;
  const debit = money(formData.get("debit"));
  const credit = money(formData.get("credit"));
  if (debit === "0" && credit === "0") return;
  const count = (await db.select({ id: recurringJournalLines.id }).from(recurringJournalLines).where(eq(recurringJournalLines.templateId, templateId))).length;
  await db.insert(recurringJournalLines).values({ templateId, accountId, debit, credit, memo: str(formData.get("memo")), sortOrder: count });
  await audit({ userId: user.id, action: "recurring.line_add", entityType: "recurring_journal", entityId: templateId });
  revalidatePath(`/accounting/recurring/${templateId}`);
}

export async function removeRecurringLineAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const templateId = String(formData.get("templateId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (!templateId || !lineId) return;
  await db.delete(recurringJournalLines).where(eq(recurringJournalLines.id, lineId));
  await audit({ userId: user.id, action: "recurring.line_remove", entityType: "recurring_journal", entityId: templateId });
  revalidatePath(`/accounting/recurring/${templateId}`);
}

export async function deleteRecurringAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(recurringJournals).where(eq(recurringJournals.id, id)); // lines cascade
  await audit({ userId: user.id, action: "recurring.delete", entityType: "recurring_journal", entityId: id });
  redirect("/accounting/recurring");
}

/** Post this month's entry now (rather than waiting for the cron). */
export async function postRecurringNowAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await postRecurringTemplate(id, new Date(), user.id);
  await audit({ userId: user.id, action: "recurring.post_now", entityType: "recurring_journal", entityId: id });
  revalidatePath(`/accounting/recurring/${id}`);
}
