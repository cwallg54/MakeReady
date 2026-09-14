import Link from "next/link";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/guards";
import { canEdit, canView } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { listReports, listCategories, expenseAnalysis } from "@/lib/accounting/expenses";
import { createExpenseReportAction } from "@/lib/accounting/expense-actions";
import { ytdRange } from "@/lib/accounting/fiscal";
import { fiscalStartMonth } from "@/lib/accounting/fiscal-service";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const moneyR = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmt = (d: Date | string | null) =>
  !d ? "—" : typeof d === "string" ? DateTime.fromISO(d).toFormat("LLL d, yyyy") : DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy");
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

const STATUS_STYLE: Record<string, string> = {
  draft: "border-neutral-200 bg-neutral-100 text-neutral-600",
  submitted: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-sky-200 bg-sky-50 text-sky-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  settled: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-neutral-200 bg-neutral-100 text-neutral-400",
};

const PAID_BY_LABEL: Record<string, string> = {
  employee: "Employee",
  company_card: "Company card",
  corporate_card: "Corporate card",
  on_account: "On account",
};

export default async function ExpensesPage() {
  const user = await requireUser();
  const isFinance = canView(user.roles, "accounting") && canEdit(user.roles, "accounting");
  const startMonth = await fiscalStartMonth();
  const today = DateTime.now().setZone(TZ).toFormat("yyyy-LL-dd");
  const ytd = ytdRange(today, startMonth);

  const [reports, categories, analysis, staff] = await Promise.all([
    // Finance sees everyone's; everyone else sees their own.
    listReports(isFinance ? {} : { employeeId: user.id }),
    listCategories(),
    isFinance ? expenseAnalysis(ytd.startDate, today) : Promise.resolve([]),
    isFinance ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.status, "active")).orderBy(users.name) : Promise.resolve([]),
  ]);

  const awaiting = reports.filter((r) => r.status === "submitted");
  const toSettle = reports.filter((r) => r.status === "approved");
  const owed = toSettle.reduce((s, r) => s + r.reimbursable, 0);
  const ytdSpend = analysis.reduce((s, r) => s + r.amount, 0);

  const byCategory = [...new Set(analysis.map((a) => a.category))]
    .map((c) => ({ category: c, amount: analysis.filter((a) => a.category === c).reduce((s, a) => s + a.amount, 0) }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Expenses"
        description={
          isFinance
            ? "Employee spend on the company's behalf: claimed, approved, then either reimbursed through Accounts Payable or booked against the company card."
            : "Claim what you have spent on the company's behalf. Once approved, reimbursements are paid with the normal supplier run."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting approval" value={String(awaiting.length)} />
        <StatCard label="Approved, not yet paid" value={moneyR(owed)} />
        <StatCard label={isFinance ? "Expense spend YTD" : "My reports"} value={isFinance ? moneyR(ytdSpend) : String(reports.length)} />
        <StatCard label="Categories" value={String(categories.length)} />
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Start a report</h2>
        <p className="mb-3 text-xs text-neutral-500">
          One report per trip or per month — add each receipt as a line, then submit the lot for approval.
        </p>
        <form action={createExpenseReportAction} className="flex flex-wrap items-end gap-3">
          {isFinance && staff.length > 0 && (
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Employee</span>
              <select name="employeeId" className={inp} defaultValue={user.id}>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="min-w-[16rem] flex-1">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Purpose</span>
            <input name="purpose" className={`w-full ${inp}`} placeholder="e.g. Denver trade show, Mar 2026" required />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-neutral-600">From</span>
            <input name="periodFrom" type="date" className={inp} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-neutral-600">To</span>
            <input name="periodTo" type="date" className={inp} />
          </label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create</button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">{isFinance ? "All reports" : "My reports"}</h2>
        {reports.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">Nothing claimed yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Report</th>
                  {isFinance && <th className="py-2 pr-3">Employee</th>}
                  <th className="py-2 pr-3">Purpose</th>
                  <th className="py-2 pr-3">Period</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Owed back</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      <Link href={`/accounting/expenses/${r.id}`} className="font-mono text-xs text-neutral-700 hover:text-brand">{r.reportNumber}</Link>
                    </td>
                    {isFinance && <td className="py-2 pr-3 text-neutral-900">{r.employee ?? "—"}</td>}
                    <td className="py-2 pr-3 text-neutral-700">{r.purpose ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">
                      {r.periodFrom ? `${fmt(r.periodFrom)} – ${fmt(r.periodTo)}` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-900">{money(r.total)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{r.reimbursable ? money(r.reimbursable) : "—"}</td>
                    <td className="py-2">
                      <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      {r.billId && <Link href={`/accounting/bills/${r.billId}`} className="ml-2 text-[11px] text-neutral-400 underline">bill</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isFinance && byCategory.length > 0 && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Spend by category, year to date</h2>
          <p className="mb-3 text-xs text-neutral-500">Approved and settled claims only.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {byCategory.map((c) => (
              <div key={c.category} className="rounded-lg border border-neutral-200 p-3">
                <div className="text-xs text-neutral-500">{c.category}</div>
                <div className="text-lg font-bold text-neutral-900">{moneyR(c.amount)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-neutral-600">
            {[...new Set(analysis.map((a) => a.paidBy))].map((p) => (
              <span key={p}>
                {PAID_BY_LABEL[p] ?? p}:{" "}
                <strong className="text-neutral-900">
                  {moneyR(analysis.filter((a) => a.paidBy === p).reduce((s, a) => s + a.amount, 0))}
                </strong>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">What each category books to</h2>
        <p className="mb-3 text-xs text-neutral-500">A claim posts to its category's account, carrying that account's department.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div key={c.id} className="flex items-baseline justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <span className="text-neutral-900">
                {c.name}
                {c.requiresDetail && <span className="ml-1 text-[10px] text-amber-600">needs detail</span>}
              </span>
              <span className="shrink-0 text-right text-xs text-neutral-500">
                <span className="font-mono">{c.accountCode ?? "—"}</span>
                {c.segment && <span className="ml-1 text-neutral-400">{c.segment}</span>}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
