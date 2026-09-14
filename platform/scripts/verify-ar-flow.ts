import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";
import { db } from "../src/db";
import { businessPartners, invoices, payments, arApplications, creditMemos, users } from "../src/db/schema";
import {
  applyPayment,
  applyCreditMemo,
  invoiceApplied,
  paymentUnapplied,
  creditMemoOpen,
  openInvoicesFor,
  allocateOldestFirst,
  recomputeAccountBalanceFromApplications,
} from "../src/lib/accounting/ar-apply";

/**
 * End-to-end check of cash application on real tables: one receipt settling
 * several invoices, a partial payment, on-account cash, and a credit memo
 * absorbing the rest. Creates its own scratch data and deletes it again.
 *
 * Run: pnpm verify:ar
 *   (server-only resolves to a no-op only under the react-server export
 *    condition, which is why NODE_OPTIONS sets it — Next does the same.)
 */
const money = (n: number) => n.toFixed(2);
let failures = 0;
function check(label: string, actual: number, expected: number) {
  const ok = Math.abs(actual - expected) < 0.005;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(46)} expected ${money(expected).padStart(10)}  got ${money(actual).padStart(10)}`);
}

async function main() {
  const user = await db.query.users.findFirst({ columns: { id: true } });
  if (!user) throw new Error("no users");

  const [bp] = await db
    .insert(businessPartners)
    .values({ companyName: "ZZ AR Flow Test", bpNumber: `ZZTEST-${Date.now()}`, lifecycleStage: "customer" })
    .returning({ id: businessPartners.id });

  const mk = async (num: string, total: number, daysAgo: number) => {
    const issue = new Date(Date.now() - daysAgo * 86_400_000);
    const [inv] = await db
      .insert(invoices)
      .values({
        invoiceNumber: `ZZ-${num}-${Date.now()}`,
        bpId: bp.id,
        status: "sent",
        issueDate: issue,
        dueDate: new Date(issue.getTime() + 30 * 86_400_000),
        subtotal: total.toFixed(2),
        total: total.toFixed(2),
      })
      .returning({ id: invoices.id });
    return inv.id;
  };

  // Three invoices, oldest first: 400, 250, 1000.
  const a = await mk("A", 400, 60);
  const b = await mk("B", 250, 45);
  const c = await mk("C", 1000, 10);

  // ---- one cheque covering the two oldest, plus part of the third ----
  const [pay] = await db
    .insert(payments)
    .values({ bpId: bp.id, amount: "800.00", method: "check", reference: "ZZ-CHK-1", receivedDate: new Date() })
    .returning({ id: payments.id });

  const open = await openInvoicesFor(bp.id);
  console.log(`\nopen invoices for the test customer: ${open.length} (${open.map((o) => money(o.balance)).join(", ")})`);
  check("open balance total", open.reduce((s, o) => s + o.balance, 0), 1650);

  const alloc = allocateOldestFirst(800, open);
  console.log(`oldest-first allocation: ${alloc.map((l) => money(l.amount)).join(" + ")}`);
  const res1 = await applyPayment(pay.id, alloc, user.id);
  console.log(`applyPayment -> ${res1.ok ? `applied ${money(res1.applied)}, unapplied ${money(res1.unapplied)}` : `ERROR ${res1.error}`}`);

  check("invoice A fully settled", await invoiceApplied(a), 400);
  check("invoice B fully settled", await invoiceApplied(b), 250);
  check("invoice C part-paid", await invoiceApplied(c), 150);
  check("receipt fully applied", await paymentUnapplied(pay.id), 0);

  // ---- over-application must be refused ----
  const bad = await applyPayment(pay.id, [{ invoiceId: c, amount: 5000 }], user.id);
  console.log(`over-application refused: ${!bad.ok ? `yes — ${bad.error}` : "NO (bug)"}`);
  if (bad.ok) failures++;

  // ---- on-account cash ----
  const [pay2] = await db
    .insert(payments)
    .values({ bpId: bp.id, amount: "500.00", method: "ach", reference: "ZZ-ACH-1", receivedDate: new Date() })
    .returning({ id: payments.id });
  await applyPayment(pay2.id, [{ invoiceId: c, amount: 300 }], user.id);
  check("second receipt leaves cash on account", await paymentUnapplied(pay2.id), 200);
  check("invoice C now 450 settled", await invoiceApplied(c), 450);

  // ---- credit memo absorbs the remainder of invoice C ----
  const [memo] = await db
    .insert(creditMemos)
    .values({ memoNumber: `ZZCM-${Date.now()}`, bpId: bp.id, status: "open", issueDate: new Date(), subtotal: "550.00", total: "550.00", reason: "test" })
    .returning({ id: creditMemos.id });
  const res2 = await applyCreditMemo(memo.id, [{ invoiceId: c, amount: 550 }], user.id);
  console.log(`applyCreditMemo -> ${res2.ok ? `applied ${money(res2.applied)}` : `ERROR ${res2.error}`}`);
  check("invoice C fully settled by the credit", await invoiceApplied(c), 1000);
  check("credit memo fully used", await creditMemoOpen(memo.id), 0);

  const stillOpen = await openInvoicesFor(bp.id);
  check("no invoices left open", stillOpen.length, 0);

  // Customer balance: 1650 billed − 1650 applied − 200 on account = −200.
  const balance = await recomputeAccountBalanceFromApplications(bp.id);
  check("account balance is the on-account credit", balance, -200);

  const invStatuses = await db.select({ id: invoices.id, status: invoices.status }).from(invoices).where(inArray(invoices.id, [a, b, c]));
  console.log(`invoice statuses: ${invStatuses.map((i) => i.status).join(", ")}`);
  if (invStatuses.some((i) => i.status !== "paid")) { failures++; console.log("FAIL invoice statuses did not all reach paid"); }

  // ---- clean up ----
  await db.delete(arApplications).where(inArray(arApplications.invoiceId, [a, b, c]));
  await db.delete(payments).where(inArray(payments.id, [pay.id, pay2.id]));
  await db.delete(creditMemos).where(eq(creditMemos.id, memo.id));
  await db.delete(invoices).where(inArray(invoices.id, [a, b, c]));
  await db.delete(businessPartners).where(eq(businessPartners.id, bp.id));
  console.log("\nscratch data removed");

  console.log(failures === 0 ? "AR flow verified." : `${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
