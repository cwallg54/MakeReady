import Link from "next/link";
import { and, desc, eq, isNull, ne, sql, inArray } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { invoices, payments, businessPartners, creditApprovalRequests } from "@/db/schema";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { agingBucket } from "@/lib/accounting/ar";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const money2 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function AccountingHome() {
  await requireModule("accounting");
  const now = new Date();

  const open = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, total: invoices.total, dueDate: invoices.dueDate, status: invoices.status, company: businessPartners.companyName })
    .from(invoices)
    .leftJoin(businessPartners, eq(invoices.bpId, businessPartners.id))
    .where(and(isNull(invoices.voidedAt), ne(invoices.status, "paid")))
    .orderBy(desc(invoices.createdAt));

  const ids = open.map((i) => i.id);
  const paidRows = ids.length ? await db.select({ invoiceId: payments.invoiceId, paid: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(inArray(payments.invoiceId, ids)).groupBy(payments.invoiceId) : [];
  const paidBy = new Map(paidRows.map((p) => [p.invoiceId, Number(p.paid)]));

  let outstanding = 0;
  let overdue = 0;
  for (const inv of open) {
    const bal = Number(inv.total) - (paidBy.get(inv.id) ?? 0);
    if (bal <= 0.005) continue;
    outstanding += bal;
    if (agingBucket(inv.dueDate, now) !== "current") overdue += bal;
  }

  // Payments received in the last 30 days.
  const [recentPay] = await db.select({ sum: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(sql`${payments.receivedDate} >= now() - interval '30 days'`);
  const [pendingCredit] = await db.select({ n: sql<number>`count(*)::int` }).from(creditApprovalRequests).where(eq(creditApprovalRequests.status, "pending"));
  const pendingCreditN = pendingCredit?.n ?? 0;

  const overdueList = open
    .map((i) => ({ ...i, balance: Number(i.total) - (paidBy.get(i.id) ?? 0) }))
    .filter((i) => i.balance > 0.005 && i.dueDate && agingBucket(i.dueDate, now) !== "current")
    .sort((a, b) => (a.dueDate!.getTime() - b.dueDate!.getTime()))
    .slice(0, 12);

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Accounting"
        description="Accounts receivable overview."
        action={<Link href="/accounting/invoices/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New invoice</Link>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding AR" value={money(outstanding)} hint="Open invoice balances" />
        <StatCard label="Overdue" value={money(overdue)} hint="Past due date" />
        <StatCard label="Open invoices" value={String(open.length)} hint="Not fully paid" />
        <StatCard label="Collected (30d)" value={money(Number(recentPay?.sum ?? 0))} hint="Payments received" />
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/accounting/invoices" className="rounded-md border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-50">All invoices →</Link>
        <Link href="/accounting/aging" className="rounded-md border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-50">AR aging →</Link>
        <Link href="/accounting/payments" className="rounded-md border border-neutral-300 bg-white px-4 py-2 font-medium text-neutral-700 hover:bg-neutral-50">Payments →</Link>
        <Link href="/accounting/credit-requests" className={`rounded-md border px-4 py-2 font-medium ${pendingCreditN > 0 ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>Credit requests{pendingCreditN > 0 ? ` (${pendingCreditN})` : ""} →</Link>
      </div>

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-5 py-3"><h2 className="text-sm font-semibold text-neutral-900">Overdue invoices</h2></div>
        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-neutral-400"><th className="px-5 py-2">Invoice</th><th className="px-5 py-2">Customer</th><th className="px-5 py-2">Due</th><th className="px-5 py-2 text-right">Balance</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {overdueList.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-neutral-400">Nothing overdue. 🎉</td></tr>}
              {overdueList.map((i) => (
                <tr key={i.id}>
                  <td className="px-5 py-2"><Link href={`/accounting/invoices/${i.id}`} className="font-medium text-blue-600 hover:underline">{i.invoiceNumber}</Link></td>
                  <td className="px-5 py-2 text-neutral-800">{i.company ?? "—"}</td>
                  <td className="px-5 py-2 font-medium text-red-600">{i.dueDate ? fmtDate(i.dueDate) : "—"}</td>
                  <td className="px-5 py-2 text-right tabular-nums font-medium text-neutral-900">{money2(i.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <ul className="divide-y divide-neutral-100 lg:hidden">
          {overdueList.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-400">Nothing overdue. 🎉</li>}
          {overdueList.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <Link href={`/accounting/invoices/${i.id}`} className="font-medium text-blue-600 hover:underline">{i.invoiceNumber}</Link>
                <div className="truncate text-sm text-neutral-700">{i.company ?? "—"}</div>
                <div className="text-xs font-medium text-red-600">due {i.dueDate ? fmtDate(i.dueDate) : "—"}</div>
              </div>
              <div className="shrink-0 tabular-nums text-sm font-semibold text-neutral-900">{money2(i.balance)}</div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
