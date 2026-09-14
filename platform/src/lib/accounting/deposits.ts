import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, deposits, glAccounts, journalEntries, numberSeries, payments } from "@/db/schema";
import { createJournal, voidJournal, type DraftLine } from "./journal";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The clearing account receipts sit in between being taken and being banked
 *  ("undeposited funds" / "checks clearing"). Created on first use so the
 *  two-step cash flow works even on a fresh chart of accounts. */
export async function undepositedAccountId(): Promise<string | null> {
  const existing = await db.query.glAccounts.findFirst({
    where: and(eq(glAccounts.systemKey, "undeposited"), eq(glAccounts.active, true)),
    columns: { id: true },
  });
  if (existing) return existing.id;

  // Prefer the real "Checks Clearing" account when the SAP chart is loaded.
  const clearing = await db.query.glAccounts.findFirst({
    where: and(eq(glAccounts.code, "1006000"), eq(glAccounts.active, true)),
    columns: { id: true },
  });
  if (clearing) {
    await db.update(glAccounts).set({ systemKey: "undeposited" }).where(eq(glAccounts.id, clearing.id));
    return clearing.id;
  }

  try {
    const [row] = await db
      .insert(glAccounts)
      .values({
        code: "1006000",
        name: "Checks Clearing",
        type: "asset",
        subtype: "Current Asset",
        description: "Receipts taken but not yet banked. Cleared by the deposit that banks them.",
        systemKey: "undeposited",
        active: true,
      })
      .returning({ id: glAccounts.id });
    return row?.id ?? null;
  } catch {
    const again = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "undeposited"), columns: { id: true } });
    return again?.id ?? null;
  }
}

async function nextDepositNumber(): Promise<string> {
  let s = await db.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, "deposit") });
  if (!s) [s] = await db.insert(numberSeries).values({ documentType: "deposit", prefix: "DEP-", nextNumber: 1, padding: 5 }).returning();
  const n = s.nextNumber;
  await db.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
  return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
}

/** Receipts that have been taken but not yet banked. */
export async function undepositedPayments() {
  const rows = await db
    .select({
      id: payments.id,
      reference: payments.reference,
      method: payments.method,
      receivedDate: payments.receivedDate,
      amount: payments.amount,
      customer: businessPartners.companyName,
    })
    .from(payments)
    .leftJoin(businessPartners, eq(businessPartners.id, payments.bpId))
    .where(isNull(payments.depositId))
    .orderBy(asc(payments.receivedDate));
  return rows.map((r) => ({ ...r, amount: Number(r.amount), customer: r.customer ?? "—" }));
}

export type DepositResult = { ok: true; id: string; depositNumber: string; total: number } | { ok: false; error: string };

/** Bank a batch of receipts: Dr bank account / Cr clearing, one journal entry
 *  for the batch — which is what the bank statement will show. */
export async function createDeposit(
  input: { paymentIds: string[]; bankAccountId: string; depositDate: Date; method?: "check" | "ach" | "card" | "cash" | "credit" | "other"; reference?: string | null; notes?: string | null },
  userId: string,
): Promise<DepositResult> {
  const ids = Array.from(new Set(input.paymentIds.filter(Boolean)));
  if (!ids.length) return { ok: false, error: "Select at least one receipt to deposit." };

  const rows = await db.select({ id: payments.id, amount: payments.amount, depositId: payments.depositId }).from(payments).where(inArray(payments.id, ids));
  if (rows.length !== ids.length) return { ok: false, error: "One of those receipts no longer exists." };
  if (rows.some((r) => r.depositId)) return { ok: false, error: "One of those receipts is already in a deposit." };

  const bank = await db.query.glAccounts.findFirst({ where: eq(glAccounts.id, input.bankAccountId), columns: { id: true, name: true, active: true } });
  if (!bank || !bank.active) return { ok: false, error: "Choose a bank account." };

  const total = round2(rows.reduce((s, r) => s + Number(r.amount), 0));
  if (total <= 0) return { ok: false, error: "That batch adds up to nothing." };

  const depositNumber = await nextDepositNumber();
  const [dep] = await db
    .insert(deposits)
    .values({
      depositNumber,
      depositDate: input.depositDate,
      bankAccountId: input.bankAccountId,
      method: input.method ?? "check",
      reference: input.reference ?? null,
      total: total.toFixed(2),
      status: "deposited",
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning({ id: deposits.id });

  await db.update(payments).set({ depositId: dep.id }).where(inArray(payments.id, ids));

  // GL: move the batch out of clearing into the bank.
  const clearing = await undepositedAccountId();
  if (clearing) {
    const lines: DraftLine[] = [
      { accountId: input.bankAccountId, debit: total, credit: 0, memo: `Deposit ${depositNumber}` },
      { accountId: clearing, debit: 0, credit: total, memo: `${rows.length} receipt${rows.length === 1 ? "" : "s"} banked` },
    ];
    await createJournal(
      { date: input.depositDate, memo: `Deposit ${depositNumber} to ${bank.name}`, lines, source: "deposit", sourceId: dep.id, post: true },
      userId,
    );
  }

  return { ok: true, id: dep.id, depositNumber, total };
}

/** Void a deposit: release its receipts and reverse the bank posting. */
export async function voidDeposit(depositId: string, userId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const dep = await db.query.deposits.findFirst({ where: eq(deposits.id, depositId) });
  if (!dep) return { ok: false, error: "Deposit not found." };
  if (dep.status === "void") return { ok: true };

  const entry = await db.query.journalEntries.findFirst({
    where: and(eq(journalEntries.source, "deposit"), eq(journalEntries.sourceId, depositId)),
    columns: { id: true },
  });
  if (entry) {
    const res = await voidJournal(entry.id, userId, reason || `Deposit ${dep.depositNumber} voided`);
    if (!res.ok) return res;
  }
  await db.update(payments).set({ depositId: null }).where(eq(payments.depositId, depositId));
  await db.update(deposits).set({ status: "void", notes: reason || dep.notes, updatedAt: new Date() }).where(eq(deposits.id, depositId));
  return { ok: true };
}

export async function listDeposits(limit = 100) {
  const rows = await db
    .select({
      id: deposits.id,
      depositNumber: deposits.depositNumber,
      depositDate: deposits.depositDate,
      method: deposits.method,
      reference: deposits.reference,
      total: deposits.total,
      status: deposits.status,
      bank: glAccounts.name,
      receipts: sql<string>`(SELECT COUNT(*) FROM payments p WHERE p.deposit_id = "deposits"."id")`,
    })
    .from(deposits)
    .leftJoin(glAccounts, eq(glAccounts.id, deposits.bankAccountId))
    .orderBy(desc(deposits.depositDate), desc(deposits.depositNumber))
    .limit(limit);
  return rows.map((r) => ({ ...r, total: Number(r.total), receipts: Number(r.receipts) }));
}

/** Bank/cash GL accounts a deposit can be banked into. */
export async function bankAccounts() {
  return db
    .select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name })
    .from(glAccounts)
    .where(and(eq(glAccounts.type, "asset"), eq(glAccounts.active, true), sql`(${glAccounts.name} ILIKE '%checking%' OR ${glAccounts.name} ILIKE '%money market%' OR ${glAccounts.name} ILIKE '%cash%' OR ${glAccounts.systemKey} = 'cash')`))
    .orderBy(asc(glAccounts.code));
}
