import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import {
  journalEntries,
  journalLines,
  payrollRunLines,
  payrollRuns,
  payrollTemplates,
  users,
} from "../src/db/schema";
import { createPayrollRun, postPayrollRun, runDetail, savePayrollAmounts, voidPayrollRun } from "../src/lib/accounting/payroll";
import { runDueReversals } from "../src/lib/accounting/journal";

/**
 * End-to-end check of the payroll template: build a run from it, type amounts,
 * refuse to post while it is out of balance, post it, then do the same for a
 * month-end accrual and confirm the reversal unwinds on the pay date.
 *
 * Creates its own scratch runs and removes them. Posts into an OPEN period so
 * it never touches closed books.
 *
 * Run: pnpm verify:payroll
 */
let failures = 0;
const money = (n: number) => n.toFixed(2);
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const user = await db.query.users.findFirst({ columns: { id: true } });
  if (!user) throw new Error("no users");

  const template = await db.query.payrollTemplates.findFirst({ where: eq(payrollTemplates.active, true) });
  if (!template) throw new Error("no active payroll template — run scripts/seed-payroll-template.mjs");
  console.log(`template: ${template.name}\n`);

  // Post into the current (open) period so closed books stay untouched.
  const today = new Date();
  const payDate = today.toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  // ---- 1. a payroll run -----------------------------------------------------
  const created = await createPayrollRun({ templateId: template.id, kind: "payroll", payDate, copyLast: false }, user.id);
  check("run created from the template", created.ok, created.ok ? created.runNumber : created.error);
  if (!created.ok) process.exit(1);
  const runId = created.id;

  const before = await runDetail(runId);
  check("run has the template's lines", (before?.lines.length ?? 0) > 20, `${before?.lines.length} lines`);

  // Type an unbalanced set first: wages and taxes, but no net pay.
  const amounts: Record<string, number> = {};
  for (const l of before!.lines) {
    if (l.grouping === "Wages") amounts[l.id] = 10_000;
    else if (l.grouping === "Taxes") amounts[l.id] = 5_000;
    else amounts[l.id] = 0;
  }
  await savePayrollAmounts(runId, amounts);
  const unbalanced = await runDetail(runId);
  check("unbalanced run is flagged", !unbalanced!.balanced, `debits ${money(unbalanced!.debits)} vs credits ${money(unbalanced!.credits)}`);

  const refused = await postPayrollRun(runId, user.id);
  check("posting an unbalanced run is refused", !refused.ok, refused.error);

  // Now balance it: net pay credits the whole debit side.
  const netLine = before!.lines.find((l) => l.side === "credit" && l.label.includes("Net pay"))!;
  amounts[netLine.id] = unbalanced!.debits;
  await savePayrollAmounts(runId, amounts);
  const balanced = await runDetail(runId);
  check("run balances once net pay is entered", balanced!.balanced, `${money(balanced!.debits)} both sides`);

  const posted = await postPayrollRun(runId, user.id);
  check("payroll posts", posted.ok, posted.ok ? posted.entryNumber : posted.error);

  const afterPost = await runDetail(runId);
  check("run is marked posted and linked to its entry", afterPost!.run.status === "posted" && !!afterPost!.run.journalEntryId);

  // The GL entry must carry the department split, not one lump.
  const glLines = afterPost!.run.journalEntryId
    ? await db.select({ segmentId: journalLines.segmentId, debit: journalLines.debit }).from(journalLines).where(eq(journalLines.entryId, afterPost!.run.journalEntryId))
    : [];
  const segmented = glLines.filter((l) => l.segmentId).length;
  check("journal lines carry their segment", segmented > 5, `${segmented} of ${glLines.length} lines segmented`);

  // ---- 2. a month-end accrual ----------------------------------------------
  const accrualPayDate = new Date(today.getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  const acc = await createPayrollRun(
    { templateId: template.id, kind: "accrual", payDate: accrualPayDate, accrualDate: monthEnd, copyLast: true },
    user.id,
  );
  check("accrual run created", acc.ok, acc.ok ? acc.runNumber : acc.error);
  if (!acc.ok) process.exit(1);

  const accDetail = await runDetail(acc.id);
  check("accrual copied the last run's amounts", accDetail!.debits > 0, `${money(accDetail!.debits)} carried forward`);

  const accPosted = await postPayrollRun(acc.id, user.id);
  check("accrual posts", accPosted.ok, accPosted.ok ? accPosted.entryNumber : accPosted.error);

  const accRun = await runDetail(acc.id);
  const accEntry = accRun!.run.journalEntryId
    ? await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, accRun!.run.journalEntryId) })
    : null;
  check("accrual is dated the month end", accEntry?.date.toISOString().slice(0, 10) === monthEnd, accEntry?.date.toISOString().slice(0, 10));
  check("accrual carries its auto-reverse date", accEntry?.autoReverseOn === accrualPayDate, String(accEntry?.autoReverseOn));

  // ---- 3. the reversal unwinds it ------------------------------------------
  const { reversed } = await runDueReversals(new Date(`${accrualPayDate}T12:00:00`), user.id);
  check("due reversal is posted", reversed >= 1, `${reversed} reversed`);

  const reversal = await db.query.journalEntries.findFirst({
    where: eq(journalEntries.reversesEntryId, accEntry!.id),
    columns: { id: true, entryNumber: true, date: true },
  });
  check("reversal points back at the accrual", !!reversal, reversal?.entryNumber);

  const second = await runDueReversals(new Date(`${accrualPayDate}T12:00:00`), user.id);
  check("running reversals twice does not double up", second.reversed === 0, `${second.reversed} on the second pass`);

  // ---- clean up -------------------------------------------------------------
  await voidPayrollRun(runId, user.id, "verification cleanup");
  await voidPayrollRun(acc.id, user.id, "verification cleanup");
  const entryIds = [afterPost!.run.journalEntryId, accEntry?.id, reversal?.id].filter(Boolean) as string[];
  if (entryIds.length) {
    await db.delete(journalLines).where(inArray(journalLines.entryId, entryIds));
    await db.delete(journalEntries).where(inArray(journalEntries.id, entryIds));
  }
  await db.delete(payrollRunLines).where(inArray(payrollRunLines.runId, [runId, acc.id]));
  await db.delete(payrollRuns).where(inArray(payrollRuns.id, [runId, acc.id]));
  console.log("\nscratch runs and entries removed");

  console.log(failures === 0 ? "Payroll flow verified." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
