"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankTransactions, glAccounts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { createJournal } from "./journal";

async function requireAccountingEdit() {
  const user = await getCurrentUser();
  if (!user || !canEdit(user.roles, "accounting")) redirect("/403");
  return user;
}
const parseAmount = (s: string) => {
  const neg = /^\(.*\)$/.test(s.trim());
  const n = Number(s.replace(/[$,()]/g, "")) || 0;
  return neg ? -Math.abs(n) : n;
};

/** Import bank lines pasted as CSV/TSV: "date, description, amount". */
export async function importBankTxnsAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const csv = String(formData.get("csv") ?? "");
  const rows: { txnDate: Date; description: string; amount: string }[] = [];
  for (const raw of csv.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/[,\t]/).map((c) => c.trim());
    const [d, desc, amt] = [cells[0], cells.slice(1, -1).join(" ").trim(), cells[cells.length - 1]];
    const date = new Date(d);
    if (isNaN(date.getTime()) || cells.length < 2 || !/[0-9]/.test(amt)) continue; // skip headers/blanks
    rows.push({ txnDate: date, description: desc || "(bank line)", amount: parseAmount(amt).toFixed(2) });
  }
  if (rows.length) await db.insert(bankTransactions).values(rows.map((r) => ({ ...r, createdBy: user.id })));
  await audit({ userId: user.id, action: "bank.import", entityType: "bank", entityId: "import", metadata: { rows: rows.length } });
  redirect(`/accounting/reconcile?ok=${encodeURIComponent(`Imported ${rows.length} bank line${rows.length === 1 ? "" : "s"}.`)}`);
}

export async function toggleClearedAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const t = await db.query.bankTransactions.findFirst({ where: eq(bankTransactions.id, id), columns: { cleared: true } });
  if (!t) return;
  await db.update(bankTransactions).set({ cleared: !t.cleared }).where(eq(bankTransactions.id, id));
  revalidatePath("/accounting/reconcile");
}

export async function deleteBankTxnAction(formData: FormData): Promise<void> {
  await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(bankTransactions).where(eq(bankTransactions.id, id));
  revalidatePath("/accounting/reconcile");
}

/** Post an unmatched bank line to the GL (e.g. bank fee, interest) against a
 *  chosen account, then mark it cleared. Deposit → Dr Cash; withdrawal → Cr Cash. */
export async function postBankTxnAction(formData: FormData): Promise<void> {
  const user = await requireAccountingEdit();
  const id = String(formData.get("id") ?? "");
  const accountId = String(formData.get("accountId") ?? "");
  if (!id || !accountId) return;
  const t = await db.query.bankTransactions.findFirst({ where: eq(bankTransactions.id, id) });
  if (!t || t.journalEntryId) return;
  const cash = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "cash"), columns: { id: true } });
  if (!cash) redirect(`/accounting/reconcile?err=${encodeURIComponent("No Cash account configured.")}`);
  const amt = Math.abs(Number(t.amount));
  if (amt === 0) return;
  const deposit = Number(t.amount) > 0;
  const res = await createJournal({
    date: t.txnDate,
    memo: t.description || "Bank transaction",
    lines: deposit
      ? [{ accountId: cash!.id, debit: amt, credit: 0 }, { accountId, debit: 0, credit: amt }]
      : [{ accountId, debit: amt, credit: 0 }, { accountId: cash!.id, debit: 0, credit: amt }],
    source: "bank", sourceId: id, post: true,
  }, user.id);
  if (!res.ok) redirect(`/accounting/reconcile?err=${encodeURIComponent(res.error)}`);
  await db.update(bankTransactions).set({ cleared: true, journalEntryId: res.id }).where(eq(bankTransactions.id, id));
  await audit({ userId: user.id, action: "bank.post", entityType: "bank", entityId: id });
  redirect(`/accounting/reconcile?ok=${encodeURIComponent(`Posted ${res.entryNumber}.`)}`);
}
