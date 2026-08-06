"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createJournal, postJournal, voidJournal, type DraftLine } from "./journal";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function createJournalAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const dateStr = str(formData.get("date"));
  const date = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  const memo = str(formData.get("memo")) || null;
  const post = formData.get("intent") === "post";

  const accountIds = formData.getAll("accountId").map(String);
  const debits = formData.getAll("debit").map(String);
  const credits = formData.getAll("credit").map(String);
  const memos = formData.getAll("lineMemo").map(String);
  const lines: DraftLine[] = accountIds.map((accountId, i) => ({
    accountId: accountId.trim(),
    debit: Number(debits[i] ?? 0) || 0,
    credit: Number(credits[i] ?? 0) || 0,
    memo: (memos[i] ?? "").trim() || null,
  }));

  const res = await createJournal({ date, memo, lines, post }, user.id);
  if (!res.ok) redirect(`/accounting/journal/new?err=${encodeURIComponent(res.error)}`);
  await audit({ userId: user.id, action: post ? "gl.journal_post" : "gl.journal_create", entityType: "journal_entry", entityId: res.entryNumber });
  revalidatePath("/accounting/journal");
  redirect(`/accounting/journal/${res.id}`);
}

export async function postJournalAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  const res = await postJournal(id, user.id);
  if (!res.ok) redirect(`/accounting/journal/${id}?err=${encodeURIComponent(res.error ?? "Could not post.")}`);
  await audit({ userId: user.id, action: "gl.journal_post", entityType: "journal_entry", entityId: id });
  revalidatePath(`/accounting/journal/${id}`);
  revalidatePath("/accounting/journal");
  redirect(`/accounting/journal/${id}`);
}

export async function voidJournalAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  await voidJournal(id, user.id, str(formData.get("reason")));
  await audit({ userId: user.id, action: "gl.journal_void", entityType: "journal_entry", entityId: id });
  revalidatePath(`/accounting/journal/${id}`);
  revalidatePath("/accounting/journal");
}

export async function deleteDraftJournalAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = str(formData.get("id"));
  if (!id) return;
  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id), columns: { status: true } });
  if (!entry || entry.status !== "draft") redirect(`/accounting/journal/${id}?err=${encodeURIComponent("Only draft entries can be deleted.")}`);
  await db.delete(journalEntries).where(eq(journalEntries.id, id)); // lines cascade
  await audit({ userId: user.id, action: "gl.journal_delete", entityType: "journal_entry", entityId: id });
  revalidatePath("/accounting/journal");
  redirect("/accounting/journal");
}
