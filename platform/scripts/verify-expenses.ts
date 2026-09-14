import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  billLines,
  billPayments,
  bills,
  expenseCategories,
  expenseLines,
  expenseReports,
  journalEntries,
  journalLines,
  users,
  vendors,
} from "../src/db/schema";
import { addLine, createReport, decideReport, reportDetail, setApprovedAmount, settleReport, submitReport } from "../src/lib/accounting/expenses";

/**
 * End-to-end check of an expense claim: mixed employee-paid and company-card
 * lines, a category that demands an explanation, an approver trimming a line,
 * then settlement — a vendor bill for what the employee is owed and a journal
 * entry for what the card already paid. Cleans up after itself.
 *
 * Run: pnpm verify:expenses
 */
let failures = 0;
const money = (n: number) => n.toFixed(2);
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const user = await db.query.users.findFirst({ columns: { id: true, name: true } });
  if (!user) throw new Error("no users");

  const cats = await db.select().from(expenseCategories).orderBy(expenseCategories.sortOrder);
  if (!cats.length) throw new Error("no expense categories — run scripts/seed-expense-categories.mjs");
  const hotel = cats.find((c) => c.code === "HOTEL")!;
  const conference = cats.find((c) => c.code === "CONFERENCE")!; // requires detail
  const meals = cats.find((c) => c.code === "MEALS")!;

  const { id, reportNumber } = await createReport({ employeeId: user.id, purpose: "ZZ verification trip" }, user.id);
  console.log(`report: ${reportNumber}\n`);

  // Employee-paid hotel, company-card meals, and a conference line with no detail.
  await addLine(id, { categoryId: hotel.id, spentOn: "2026-09-02", vendor: "ZZ Hotel", description: "2 nights", amount: 420, paidBy: "employee" });
  await addLine(id, { categoryId: meals.id, spentOn: "2026-09-02", vendor: "ZZ Diner", description: null, amount: 60, paidBy: "company_card" });
  await addLine(id, { categoryId: conference.id, spentOn: "2026-09-03", vendor: "ZZ Expo", description: null, amount: 250, paidBy: "employee" });

  const d1 = await reportDetail(id);
  check("lines carry the category's GL account", d1!.lines.every((l) => !!l.accountId), `${d1!.lines.filter((l) => l.accountId).length}/3`);
  check("lines carry the account's segment", d1!.lines.every((l) => !!l.segmentId));
  check("total adds up", Math.abs(d1!.total - 730) < 0.005, money(d1!.total));
  check("reimbursable excludes the card line", Math.abs(d1!.reimbursable - 670) < 0.005, money(d1!.reimbursable));

  // A category that needs an explanation blocks submission.
  const blocked = await submitReport(id, user.id);
  check("submission blocked while an explanation is missing", !blocked.ok, blocked.error);

  const confLine = d1!.lines.find((l) => l.categoryId === conference.id)!;
  await db.update(expenseLines).set({ description: "Booth fee" }).where(eq(expenseLines.id, confLine.id));

  const submitted = await submitReport(id, user.id);
  check("submits once the explanation is there", submitted.ok, submitted.error);

  const afterSubmit = await reportDetail(id);
  check("status is submitted", afterSubmit!.report.status === "submitted");

  // Settling before approval must be refused.
  const early = await settleReport(id, user.id);
  check("settling before approval is refused", !early.ok, early.error);

  // Approver trims the conference line from 250 to 200.
  await setApprovedAmount(id, confLine.id, 200);
  const trimmed = await reportDetail(id);
  check("trimmed line lowers the total", Math.abs(trimmed!.total - 680) < 0.005, money(trimmed!.total));
  check("trimmed line lowers what is owed", Math.abs(trimmed!.reimbursable - 620) < 0.005, money(trimmed!.reimbursable));

  const decided = await decideReport(id, true, "approved with the booth fee trimmed", user.id);
  check("approval recorded", decided.ok, decided.error);

  const settled = await settleReport(id, user.id);
  check("settles", settled.ok, settled.ok ? `bill ${settled.billId}` : settled.error);

  const final = await reportDetail(id);
  check("status is settled", final!.report.status === "settled");
  check("a reimbursement bill was raised", !!final!.report.billId);
  check("company-card spend was journalled", !!final!.report.journalEntryId);

  // The bill must be for what is owed, not the whole claim.
  const bill = final!.report.billId ? await db.query.bills.findFirst({ where: eq(bills.id, final!.report.billId) }) : null;
  check("bill equals the reimbursable amount", !!bill && Math.abs(Number(bill.total) - 620) < 0.005, bill ? money(Number(bill.total)) : "none");

  const vendorId = bill?.vendorId ?? null;
  const vendor = vendorId ? await db.query.vendors.findFirst({ where: eq(vendors.id, vendorId) }) : null;
  check("bill is against the employee's own vendor record", !!vendor && vendor.name.includes(user.name ?? ""), vendor?.name);

  // The card entry must balance and hit the card liability.
  const entryLines = final!.report.journalEntryId
    ? await db.select().from(journalLines).where(eq(journalLines.entryId, final!.report.journalEntryId))
    : [];
  const dr = entryLines.reduce((s, l) => s + Number(l.debit), 0);
  const cr = entryLines.reduce((s, l) => s + Number(l.credit), 0);
  check("card entry balances", Math.abs(dr - cr) < 0.005 && Math.abs(dr - 60) < 0.005, `${money(dr)} / ${money(cr)}`);

  // ---- clean up -------------------------------------------------------------
  const entryIds = [final!.report.journalEntryId].filter(Boolean) as string[];
  const billIds = [final!.report.billId].filter(Boolean) as string[];
  if (billIds.length) {
    const billEntries = await db.select({ id: journalEntries.id }).from(journalEntries).where(inArray(journalEntries.sourceId, billIds));
    for (const e of billEntries) entryIds.push(e.id);
    await db.delete(billPayments).where(inArray(billPayments.billId, billIds));
    await db.delete(billLines).where(inArray(billLines.billId, billIds));
  }
  if (entryIds.length) {
    await db.delete(journalLines).where(inArray(journalLines.entryId, entryIds));
    await db.delete(journalEntries).where(inArray(journalEntries.id, entryIds));
  }
  if (billIds.length) await db.delete(bills).where(inArray(bills.id, billIds));
  await db.delete(expenseLines).where(eq(expenseLines.reportId, id));
  await db.delete(expenseReports).where(eq(expenseReports.id, id));
  // The auto-created expense vendor is left in place — it is the employee's
  // permanent reimbursement record, not scratch data.
  console.log("\nscratch report, bill and entries removed");

  console.log(failures === 0 ? "Expense flow verified." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
