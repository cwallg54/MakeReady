import Link from "next/link";
import { and, desc, eq, isNull, ne, sql, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { invoices, payments, businessPartners, creditApprovalRequests, bills, billPayments, journalLines, journalEntries, glAccounts } from "@/db/schema";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { agingBucket } from "@/lib/accounting/ar";
import { incomeStatement } from "@/lib/accounting/statements";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const money2 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Tile { href: string; label: string; desc: string; badge?: string; badgeTone?: "amber" }

function Section({ title, tiles }: { title: string; tiles: Tile[] }) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-900 group-hover:text-brand-ink">{t.label}</span>
              {t.badge && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.badgeTone === "amber" ? "bg-amber-100 text-amber-700" : "bg-neutral-100 text-neutral-500"}`}>{t.badge}</span>}
            </div>
            <p className="mt-1 text-xs text-neutral-500">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default async function AccountingHome() {
  await requireModule("accounting");
  const now = new Date();

  // ---- Receivables (open invoices + aging) ----
  const open = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, total: invoices.total, dueDate: invoices.dueDate, company: businessPartners.companyName })
    .from(invoices).leftJoin(businessPartners, eq(invoices.bpId, businessPartners.id))
    .where(and(isNull(invoices.voidedAt), ne(invoices.status, "paid"))).orderBy(desc(invoices.createdAt));
  const invIds = open.map((i) => i.id);
  const paidRows = invIds.length ? await db.select({ invoiceId: payments.invoiceId, paid: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(inArray(payments.invoiceId, invIds)).groupBy(payments.invoiceId) : [];
  const paidBy = new Map(paidRows.map((p) => [p.invoiceId, Number(p.paid)]));
  let arOutstanding = 0, overdue = 0;
  for (const inv of open) {
    const bal = Number(inv.total) - (paidBy.get(inv.id) ?? 0);
    if (bal <= 0.005) continue;
    arOutstanding += bal;
    if (agingBucket(inv.dueDate, now) !== "current") overdue += bal;
  }

  // ---- Payables (open bills) ----
  const openBills = await db.select({ id: bills.id, total: bills.total }).from(bills).where(inArray(bills.status, ["open", "partial"]));
  const billIds = openBills.map((b) => b.id);
  const billPaidRows = billIds.length ? await db.select({ billId: billPayments.billId, paid: sql<string>`COALESCE(SUM(${billPayments.amount}),0)` }).from(billPayments).where(inArray(billPayments.billId, billIds)).groupBy(billPayments.billId) : [];
  const billPaidBy = new Map(billPaidRows.map((p) => [p.billId, Number(p.paid)]));
  const apOutstanding = openBills.reduce((s, b) => s + (Number(b.total) - (billPaidBy.get(b.id) ?? 0)), 0);

  // ---- Cash + net income (from the GL) ----
  const [cashRow] = await db.select({ b: sql<string>`COALESCE(SUM(${journalLines.debit} - ${journalLines.credit}),0)` })
    .from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId)).innerJoin(glAccounts, eq(glAccounts.id, journalLines.accountId))
    .where(and(eq(glAccounts.systemKey, "cash"), eq(journalEntries.status, "posted")));
  const cash = Number(cashRow?.b ?? 0);
  const yearStart = DateTime.now().setZone(TZ).startOf("year").toJSDate();
  const netIncome = (await incomeStatement(yearStart, now)).netIncome;

  const [recentPay] = await db.select({ sum: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(sql`${payments.receivedDate} >= now() - interval '30 days'`);
  const [pendingCredit] = await db.select({ n: sql<number>`count(*)::int` }).from(creditApprovalRequests).where(eq(creditApprovalRequests.status, "pending"));
  const pendingCreditN = pendingCredit?.n ?? 0;

  const overdueList = open
    .map((i) => ({ ...i, balance: Number(i.total) - (paidBy.get(i.id) ?? 0) }))
    .filter((i) => i.balance > 0.005 && i.dueDate && agingBucket(i.dueDate, now) !== "current")
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime()).slice(0, 8);

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        title="Accounting"
        description="Receivables, payables, and the general ledger — one place for the books."
        action={<Link href="/accounting/invoices/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New invoice</Link>}
      />

      {/* CFO snapshot */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Cash on hand" value={money(cash)} hint="Cash account balance" />
        <StatCard label="A/R outstanding" value={money(arOutstanding)} hint={overdue > 0 ? `${money(overdue)} overdue` : "All current"} />
        <StatCard label="A/P outstanding" value={money(apOutstanding)} hint="Unpaid vendor bills" />
        <StatCard label="Net income (YTD)" value={money(netIncome)} hint="This calendar year" />
      </div>

      <Section title="Receivables (A/R)" tiles={[
        { href: "/accounting/invoices", label: "Invoices", desc: "Raise, issue, and email customer invoices." },
        { href: "/accounting/payments", label: "Payments", desc: `Record receipts. ${money(Number(recentPay?.sum ?? 0))} in the last 30 days.` },
        { href: "/accounting/aging", label: "AR Aging", desc: "Open receivables by customer and days past due." },
        { href: "/accounting/statements", label: "Customer Statements", desc: "A customer's open items and balance due." },
        { href: "/accounting/credit-requests", label: "Credit Requests", desc: "Approve over-limit / on-hold orders.", badge: pendingCreditN > 0 ? String(pendingCreditN) : undefined, badgeTone: "amber" },
      ]} />

      <Section title="Payables (A/P)" tiles={[
        { href: "/accounting/bills", label: "Bills", desc: "Enter, approve, and pay vendor bills." },
        { href: "/accounting/vendors", label: "Vendors", desc: "Your suppliers and their terms." },
        { href: "/accounting/landed-cost", label: "Landed Cost", desc: "Spread freight across a shipment into each item's true landed cost." },
      ]} />

      <Section title="General Ledger" tiles={[
        { href: "/accounting/chart", label: "Chart of Accounts", desc: "The account structure the books post to." },
        { href: "/accounting/journal", label: "Journal Entries", desc: "Manual double-entry postings & adjustments." },
        { href: "/accounting/recurring", label: "Recurring Entries", desc: "Templates that auto-post the same entry each month." },
        { href: "/accounting/ledger", label: "Account Ledger", desc: "Every posting for one account, with a running balance." },
        { href: "/accounting/trial-balance", label: "Trial Balance", desc: "All account balances — debits equal credits." },
      ]} />

      <Section title="Financial Statements" tiles={[
        { href: "/accounting/income-statement", label: "Income Statement", desc: "Revenue, expenses, and net income (P&L)." },
        { href: "/accounting/balance-sheet", label: "Balance Sheet", desc: "Assets, liabilities, and equity as of a date." },
        { href: "/accounting/cash-flow", label: "Cash Flow", desc: "Cash in and out by activity." },
      ]} />

      <Section title="Close & Setup" tiles={[
        { href: "/accounting/reconcile", label: "Bank Reconciliation", desc: "Match a bank statement to the cash ledger." },
        { href: "/accounting/close", label: "Period Close", desc: "Lock closed periods so the books can't change." },
        { href: "/accounting/import", label: "Import / Migrate", desc: "Post real balances from an export; retire estimates." },
      ]} />

      {/* Overdue */}
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Overdue invoices</h2>
          <Link href="/accounting/aging" className="text-xs font-medium text-brand-ink hover:underline">AR aging →</Link>
        </div>
        <ul className="divide-y divide-neutral-100">
          {overdueList.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-400">Nothing overdue. 🎉</li>}
          {overdueList.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <div className="min-w-0">
                <Link href={`/accounting/invoices/${i.id}`} className="text-sm font-medium text-brand-ink hover:underline">{i.invoiceNumber}</Link>
                <span className="ml-2 text-sm text-neutral-700">{i.company ?? "—"}</span>
                <span className="ml-2 text-xs font-medium text-red-600">due {i.dueDate ? fmtDate(i.dueDate) : "—"}</span>
              </div>
              <span className="shrink-0 tabular-nums text-sm font-semibold text-neutral-900">{money2(i.balance)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Roadmap — where the former "Controlling" / "Asset Accounting" placeholders are headed */}
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
        <span className="font-semibold text-neutral-600">On the roadmap:</span> Controlling (cost centers, profitability by product/customer/rep, budget vs. actual) and Fixed Assets (asset register &amp; depreciation schedules) — the management-accounting layer on top of these books.
      </div>
    </div>
  );
}
