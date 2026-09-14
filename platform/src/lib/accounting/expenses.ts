import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billLines,
  bills,
  expenseCategories,
  expenseLines,
  expenseReports,
  glAccounts,
  glSegments,
  numberSeries,
  users,
  vendors,
} from "@/db/schema";
import { createJournal, voidJournal, type DraftLine } from "./journal";
import { postBillToGl } from "./gl-post";
import { evaluateApprovals } from "@/lib/workflows/approvals";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Only employee-paid spend gets money back; the rest is already out the door. */
export const REIMBURSABLE: readonly string[] = ["employee"];

async function nextNumber(documentType: string, prefix: string): Promise<string> {
  let s = await db.query.numberSeries.findFirst({ where: eq(numberSeries.documentType, documentType) });
  if (!s) [s] = await db.insert(numberSeries).values({ documentType, prefix, nextNumber: 1, padding: 5 }).returning();
  const n = s.nextNumber;
  await db.update(numberSeries).set({ nextNumber: n + 1, updatedAt: new Date() }).where(eq(numberSeries.id, s.id));
  return `${s.prefix}${String(n).padStart(s.padding, "0")}`;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listCategories(activeOnly = true) {
  const rows = await db
    .select({
      id: expenseCategories.id,
      code: expenseCategories.code,
      name: expenseCategories.name,
      requiresDetail: expenseCategories.requiresDetail,
      active: expenseCategories.active,
      accountId: expenseCategories.accountId,
      accountCode: glAccounts.code,
      accountName: glAccounts.name,
      segment: glSegments.shortName,
    })
    .from(expenseCategories)
    .leftJoin(glAccounts, eq(glAccounts.id, expenseCategories.accountId))
    .leftJoin(glSegments, eq(glSegments.id, glAccounts.segmentId))
    .orderBy(asc(expenseCategories.sortOrder));
  return activeOnly ? rows.filter((c) => c.active) : rows;
}

export async function reportDetail(reportId: string) {
  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId) });
  if (!report) return null;

  const [lines, employee] = await Promise.all([
    db
      .select({
        id: expenseLines.id,
        categoryId: expenseLines.categoryId,
        category: expenseCategories.name,
        requiresDetail: expenseCategories.requiresDetail,
        accountId: expenseLines.accountId,
        segmentId: expenseLines.segmentId,
        accountCode: glAccounts.code,
        accountName: glAccounts.name,
        segment: glSegments.shortName,
        spentOn: expenseLines.spentOn,
        vendor: expenseLines.vendor,
        description: expenseLines.description,
        amount: expenseLines.amount,
        approvedAmount: expenseLines.approvedAmount,
        paidBy: expenseLines.paidBy,
        receiptName: expenseLines.receiptName,
        sortOrder: expenseLines.sortOrder,
      })
      .from(expenseLines)
      .leftJoin(expenseCategories, eq(expenseCategories.id, expenseLines.categoryId))
      .leftJoin(glAccounts, eq(glAccounts.id, expenseLines.accountId))
      .leftJoin(glSegments, eq(glSegments.id, glAccounts.segmentId))
      .where(eq(expenseLines.reportId, reportId))
      .orderBy(asc(expenseLines.sortOrder)),
    db.query.users.findFirst({ where: eq(users.id, report.employeeId), columns: { id: true, name: true, email: true, expenseVendorId: true } }),
  ]);

  const mapped = lines.map((l) => ({
    ...l,
    amount: Number(l.amount),
    approvedAmount: l.approvedAmount === null ? null : Number(l.approvedAmount),
    /** What will actually be booked — the approved figure when one was set. */
    effective: l.approvedAmount === null ? Number(l.amount) : Number(l.approvedAmount),
  }));

  const total = round2(mapped.reduce((s, l) => s + l.effective, 0));
  const reimbursable = round2(mapped.filter((l) => REIMBURSABLE.includes(l.paidBy)).reduce((s, l) => s + l.effective, 0));
  const missingAccount = mapped.filter((l) => !l.accountId).length;
  const missingDetail = mapped.filter((l) => l.requiresDetail && !(l.description ?? "").trim()).length;

  return { report, lines: mapped, employee, total, reimbursable, companyPaid: round2(total - reimbursable), missingAccount, missingDetail };
}

export async function listReports(opts: { employeeId?: string; limit?: number } = {}) {
  const conds = opts.employeeId ? [eq(expenseReports.employeeId, opts.employeeId)] : [];
  const rows = await db
    .select({
      id: expenseReports.id,
      reportNumber: expenseReports.reportNumber,
      purpose: expenseReports.purpose,
      status: expenseReports.status,
      periodFrom: expenseReports.periodFrom,
      periodTo: expenseReports.periodTo,
      total: expenseReports.total,
      reimbursable: expenseReports.reimbursable,
      submittedAt: expenseReports.submittedAt,
      employee: users.name,
      employeeId: expenseReports.employeeId,
      billId: expenseReports.billId,
    })
    .from(expenseReports)
    .leftJoin(users, eq(users.id, expenseReports.employeeId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(expenseReports.createdAt))
    .limit(opts.limit ?? 100);
  return rows.map((r) => ({ ...r, total: Number(r.total), reimbursable: Number(r.reimbursable) }));
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export async function createReport(
  input: { employeeId: string; purpose?: string | null; periodFrom?: string | null; periodTo?: string | null },
  userId: string,
): Promise<{ id: string; reportNumber: string }> {
  const reportNumber = await nextNumber("expense_report", "EXP-");
  const [row] = await db
    .insert(expenseReports)
    .values({
      reportNumber,
      employeeId: input.employeeId,
      purpose: input.purpose ?? null,
      periodFrom: input.periodFrom ?? null,
      periodTo: input.periodTo ?? null,
      status: "draft",
      createdBy: userId,
    })
    .returning({ id: expenseReports.id });
  return { id: row.id, reportNumber };
}

/** Recompute the stored totals from the lines. */
export async function refreshReport(reportId: string): Promise<void> {
  const detail = await reportDetail(reportId);
  if (!detail) return;
  await db
    .update(expenseReports)
    .set({ total: detail.total.toFixed(2), reimbursable: detail.reimbursable.toFixed(2), updatedAt: new Date() })
    .where(eq(expenseReports.id, reportId));
}

export async function addLine(
  reportId: string,
  input: {
    categoryId: string | null;
    spentOn: string | null;
    vendor: string | null;
    description: string | null;
    amount: number;
    paidBy: "employee" | "company_card" | "corporate_card" | "on_account";
  },
): Promise<{ ok: boolean; error?: string }> {
  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId), columns: { status: true } });
  if (!report) return { ok: false, error: "Report not found." };
  if (report.status !== "draft") return { ok: false, error: "Only a draft report can be changed." };

  // Snapshot the category's account so re-pointing it later never rewrites
  // what has already been claimed.
  const category = input.categoryId
    ? await db.query.expenseCategories.findFirst({ where: eq(expenseCategories.id, input.categoryId) })
    : null;
  const account = category?.accountId
    ? await db.query.glAccounts.findFirst({ where: eq(glAccounts.id, category.accountId), columns: { id: true, segmentId: true } })
    : null;

  const [max] = await db
    .select({ n: sql<string>`COALESCE(MAX(${expenseLines.sortOrder}), 0)` })
    .from(expenseLines)
    .where(eq(expenseLines.reportId, reportId));

  await db.insert(expenseLines).values({
    reportId,
    categoryId: input.categoryId,
    accountId: account?.id ?? null,
    segmentId: account?.segmentId ?? null,
    spentOn: input.spentOn,
    vendor: input.vendor,
    description: input.description,
    amount: round2(Math.max(0, input.amount)).toFixed(2),
    paidBy: input.paidBy,
    sortOrder: Number(max?.n ?? 0) + 1,
  });
  await refreshReport(reportId);
  return { ok: true };
}

export async function removeLine(reportId: string, lineId: string): Promise<void> {
  await db.delete(expenseLines).where(and(eq(expenseLines.id, lineId), eq(expenseLines.reportId, reportId)));
  await refreshReport(reportId);
}

/** Submit for approval. The standard approval rules decide who has to sign. */
export async function submitReport(reportId: string, userId: string): Promise<{ ok: boolean; error?: string; pending?: boolean }> {
  const detail = await reportDetail(reportId);
  if (!detail) return { ok: false, error: "Report not found." };
  if (detail.report.status !== "draft") return { ok: false, error: "This report has already been submitted." };
  if (!detail.lines.length) return { ok: false, error: "Add at least one expense before submitting." };
  if (detail.total <= 0) return { ok: false, error: "The report adds up to nothing." };
  if (detail.missingDetail > 0) {
    return { ok: false, error: `${detail.missingDetail} line(s) are in a category that needs an explanation.` };
  }

  await db
    .update(expenseReports)
    .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(expenseReports.id, reportId));

  const res = await evaluateApprovals({
    entityType: "expense_report",
    entityId: reportId,
    title: `Expense report ${detail.report.reportNumber} — ${detail.total.toFixed(2)}`,
    amount: detail.total,
    requestedBy: userId,
  });
  return { ok: true, pending: res.pending };
}

export async function decideReport(
  reportId: string,
  approve: boolean,
  note: string,
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId) });
  if (!report) return { ok: false, error: "Report not found." };
  if (report.status !== "submitted") return { ok: false, error: "Only a submitted report can be decided." };
  await db
    .update(expenseReports)
    .set({
      status: approve ? "approved" : "rejected",
      decidedBy: userId,
      decidedAt: new Date(),
      decisionNote: note || null,
      updatedAt: new Date(),
    })
    .where(eq(expenseReports.id, reportId));
  return { ok: true };
}

/** Set what an approver will actually allow on a line. */
export async function setApprovedAmount(reportId: string, lineId: string, amount: number | null): Promise<void> {
  await db
    .update(expenseLines)
    .set({ approvedAmount: amount === null ? null : round2(Math.max(0, amount)).toFixed(2) })
    .where(and(eq(expenseLines.id, lineId), eq(expenseLines.reportId, reportId)));
  await refreshReport(reportId);
}

/** The account company-paid card spend is charged against. Created on first
 *  use so the flow works on a chart that has no card account yet. */
async function cardLiabilityAccountId(): Promise<string | null> {
  const existing = await db.query.glAccounts.findFirst({
    where: and(eq(glAccounts.systemKey, "credit_card_payable"), eq(glAccounts.active, true)),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const real = await db.query.glAccounts.findFirst({
    where: and(eq(glAccounts.code, "2322000"), eq(glAccounts.active, true)),
    columns: { id: true },
  });
  if (real) {
    await db.update(glAccounts).set({ systemKey: "credit_card_payable" }).where(eq(glAccounts.id, real.id));
    return real.id;
  }
  try {
    const [row] = await db
      .insert(glAccounts)
      .values({
        code: "2322000",
        name: "Credit Card Payable",
        type: "liability",
        subtype: "Current Liability",
        description: "Company card spend booked from expense reports, cleared when the card statement is paid.",
        systemKey: "credit_card_payable",
        active: true,
      })
      .returning({ id: glAccounts.id });
    return row?.id ?? null;
  } catch {
    const again = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "credit_card_payable"), columns: { id: true } });
    return again?.id ?? null;
  }
}

/** Make sure the employee has a vendor record to be reimbursed through. */
export async function vendorForEmployee(employeeId: string): Promise<string | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, employeeId), columns: { id: true, name: true, email: true, expenseVendorId: true } });
  if (!user) return null;
  if (user.expenseVendorId) return user.expenseVendorId;

  const [vendor] = await db
    .insert(vendors)
    .values({
      name: `${user.name} (expenses)`,
      email: user.email,
      terms: "Net 15",
      notes: "Created automatically to reimburse employee expense reports.",
      active: true,
    })
    .returning({ id: vendors.id });
  await db.update(users).set({ expenseVendorId: vendor.id }).where(eq(users.id, employeeId));
  return vendor.id;
}

/**
 * Settle an approved report.
 *
 *  Employee-paid lines become an AP bill against the employee's vendor record,
 *  so the money goes out through the normal payment run rather than by a
 *  one-off cheque. Company-card lines never get reimbursed — they post
 *  Dr expense / Cr Credit Card Payable, and clear when the card is paid.
 */
export async function settleReport(reportId: string, userId: string): Promise<{ ok: boolean; error?: string; billId?: string }> {
  const detail = await reportDetail(reportId);
  if (!detail) return { ok: false, error: "Report not found." };
  if (detail.report.status !== "approved") return { ok: false, error: "Only an approved report can be settled." };
  if (detail.missingAccount > 0) {
    return { ok: false, error: `${detail.missingAccount} line(s) have no GL account — set one on the category first.` };
  }

  let billId: string | undefined;

  // ---- the part the employee is owed ----
  const owed = detail.lines.filter((l) => REIMBURSABLE.includes(l.paidBy) && l.effective > 0);
  if (owed.length) {
    const vendorId = await vendorForEmployee(detail.report.employeeId);
    if (!vendorId) return { ok: false, error: "Could not resolve a vendor to reimburse through." };

    const billNumber = await nextNumber("bill", "BILL-");
    const due = new Date();
    due.setDate(due.getDate() + 15);
    const [bill] = await db
      .insert(bills)
      .values({
        billNumber,
        vendorId,
        vendorRef: detail.report.reportNumber,
        status: "open",
        issueDate: new Date(),
        dueDate: due,
        terms: "Net 15",
        subtotal: detail.reimbursable.toFixed(2),
        total: detail.reimbursable.toFixed(2),
        notes: `Reimbursement of expense report ${detail.report.reportNumber}`,
        createdBy: userId,
      })
      .returning({ id: bills.id });

    await db.insert(billLines).values(
      owed.map((l, i) => ({
        billId: bill.id,
        accountId: l.accountId,
        description: `${l.category ?? "Expense"}${l.vendor ? ` — ${l.vendor}` : ""}${l.description ? `: ${l.description}` : ""}`,
        qty: "1",
        unitPrice: l.effective.toFixed(2),
        extended: l.effective.toFixed(2),
        sortOrder: i,
      })),
    );
    await postBillToGl(bill.id, userId);
    billId = bill.id;
  }

  // ---- the part the company already paid on a card ----
  const onCard = detail.lines.filter((l) => !REIMBURSABLE.includes(l.paidBy) && l.effective > 0);
  let journalEntryId: string | undefined;
  if (onCard.length) {
    const cardAccount = await cardLiabilityAccountId();
    if (cardAccount) {
      const total = round2(onCard.reduce((s, l) => s + l.effective, 0));
      const draft: DraftLine[] = onCard.map((l) => ({
        accountId: l.accountId!,
        debit: l.effective,
        credit: 0,
        memo: `${l.category ?? "Expense"}${l.vendor ? ` — ${l.vendor}` : ""}`,
        segmentId: l.segmentId ?? null,
      }));
      draft.push({ accountId: cardAccount, debit: 0, credit: total, memo: `Company card — ${detail.report.reportNumber}` });
      const res = await createJournal(
        {
          date: new Date(),
          memo: `Expense report ${detail.report.reportNumber} — company card`,
          lines: draft,
          source: "expense_report",
          sourceId: reportId,
          post: true,
        },
        userId,
      );
      if (!res.ok) return { ok: false, error: res.error };
      const entry = await db.query.journalEntries.findFirst({
        where: (j, { eq: e }) => e(j.entryNumber, res.entryNumber),
        columns: { id: true },
      });
      journalEntryId = entry?.id;
    }
  }

  await db
    .update(expenseReports)
    .set({ status: "settled", billId: billId ?? null, journalEntryId: journalEntryId ?? null, settledAt: new Date(), updatedAt: new Date() })
    .where(eq(expenseReports.id, reportId));

  return { ok: true, billId };
}

export async function cancelReport(reportId: string, userId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const report = await db.query.expenseReports.findFirst({ where: eq(expenseReports.id, reportId) });
  if (!report) return { ok: false, error: "Report not found." };
  if (report.status === "settled") return { ok: false, error: "A settled report can't be cancelled — void the bill or entry instead." };
  await db
    .update(expenseReports)
    .set({ status: "cancelled", decisionNote: reason || report.decisionNote, decidedBy: userId, decidedAt: new Date(), updatedAt: new Date() })
    .where(eq(expenseReports.id, reportId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/** Expense spend by category and by who paid, over a period. */
export async function expenseAnalysis(from: string, to: string) {
  const rows = await db
    .select({
      category: sql<string>`COALESCE(${expenseCategories.name}, 'Uncategorised')`,
      paidBy: expenseLines.paidBy,
      amount: sql<string>`COALESCE(SUM(COALESCE(${expenseLines.approvedAmount}, ${expenseLines.amount})), 0)`,
      lines: sql<string>`COUNT(*)`,
    })
    .from(expenseLines)
    .innerJoin(expenseReports, eq(expenseReports.id, expenseLines.reportId))
    .leftJoin(expenseCategories, eq(expenseCategories.id, expenseLines.categoryId))
    .where(
      and(
        inArray(expenseReports.status, ["approved", "settled"]),
        sql`${expenseLines.spentOn} >= ${from}`,
        sql`${expenseLines.spentOn} <= ${to}`,
      ),
    )
    .groupBy(expenseCategories.name, expenseLines.paidBy);

  return rows.map((r) => ({ ...r, amount: round2(Number(r.amount)), lines: Number(r.lines) }));
}
