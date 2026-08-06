"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { glAccounts, journalEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createJournal, type DraftLine } from "./journal";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}

const isNum = (s: string) => s !== "" && Number.isFinite(Number(s.replace(/[$,]/g, "")));
const money = (s: string) => Number(String(s).replace(/[$,]/g, "")) || 0;

/** Post a batch of real GL lines pasted as CSV/TSV: "code, debit, credit, memo".
 *  Becomes one balanced, posted journal entry tagged source='import'. */
export async function importJournalAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const dateStr = String(formData.get("date") ?? "").trim();
  const date = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  const memo = String(formData.get("memo") ?? "").trim() || "Imported entry";
  const csv = String(formData.get("csv") ?? "");

  const accounts = await db.select({ id: glAccounts.id, code: glAccounts.code }).from(glAccounts).where(eq(glAccounts.active, true));
  const byCode = new Map(accounts.map((a) => [a.code.toLowerCase(), a.id]));

  const lines: DraftLine[] = [];
  const unknown: string[] = [];
  for (const raw of csv.split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    const cells = row.split(/[,\t]/).map((c) => c.trim());
    const [code, debit, credit, ...rest] = cells;
    if (!code || (!isNum(debit) && !isNum(credit))) continue; // skip headers / blanks
    const accountId = byCode.get(code.toLowerCase());
    if (!accountId) { unknown.push(code); continue; }
    lines.push({ accountId, debit: money(debit), credit: money(credit), memo: rest.join(" ").trim() || null });
  }

  if (unknown.length) redirect(`/accounting/import?err=${encodeURIComponent(`Unknown account code(s): ${[...new Set(unknown)].join(", ")}. Add them to the chart of accounts first.`)}`);
  if (lines.length < 2) redirect(`/accounting/import?err=${encodeURIComponent("Need at least two valid lines (code, debit, credit).")}`);

  const res = await createJournal({ date, memo, lines, source: "import", post: true }, user.id);
  if (!res.ok) redirect(`/accounting/import?err=${encodeURIComponent(res.error)}`);
  await audit({ userId: user.id, action: "gl.import", entityType: "journal_entry", entityId: res.entryNumber, metadata: { lines: lines.length } });
  revalidatePath("/accounting/journal");
  redirect(`/accounting/import?ok=${encodeURIComponent(`Posted ${res.entryNumber} with ${lines.length} lines.`)}`);
}

/** Delete the modeled expense estimates seeded for demonstration. */
export async function removeEstimatesAction(): Promise<void> {
  const user = await requireAccountingEdit();
  const rows = await db.delete(journalEntries).where(eq(journalEntries.source, "estimate")).returning({ id: journalEntries.id });
  await audit({ userId: user.id, action: "gl.remove_estimates", entityType: "journal_entry", entityId: "estimate", metadata: { removed: rows.length } });
  revalidatePath("/accounting/journal");
  revalidatePath("/accounting/income-statement");
  redirect(`/accounting/import?ok=${encodeURIComponent(`Removed ${rows.length} modeled estimate entries.`)}`);
}
