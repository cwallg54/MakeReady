import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DateTime } from "luxon";
import { requireUser } from "@/lib/auth/guards";
import { canEdit, canView } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { reportDetail, listCategories } from "@/lib/accounting/expenses";
import {
  addExpenseLineAction,
  removeExpenseLineAction,
  submitExpenseReportAction,
  decideExpenseReportAction,
  setApprovedAmountAction,
  settleExpenseReportAction,
  cancelExpenseReportAction,
} from "@/lib/accounting/expense-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (d: string | null) => (d ? DateTime.fromISO(d).toFormat("LLL d, yyyy") : "—");
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

const PAID_BY = [
  { value: "employee", label: "I paid (reimburse me)" },
  { value: "company_card", label: "Company card" },
  { value: "corporate_card", label: "Corporate card" },
  { value: "on_account", label: "On account" },
];
const PAID_BY_SHORT: Record<string, string> = {
  employee: "Employee",
  company_card: "Company card",
  corporate_card: "Corporate card",
  on_account: "On account",
};

export default async function ExpenseReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const detail = await reportDetail(id);
  if (!detail) notFound();
  const { report, lines, employee, total, reimbursable, companyPaid, missingDetail, missingAccount } = detail;

  const isFinance = canView(user.roles, "accounting") && canEdit(user.roles, "accounting");
  const isOwner = report.employeeId === user.id;
  if (!isOwner && !isFinance) redirect("/403");

  const isDraft = report.status === "draft";
  const canEditLines = isDraft && (isOwner || isFinance);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm">
        <Link href="/accounting/expenses" className="text-neutral-500 hover:text-neutral-900">← Expenses</Link>
      </div>
      <PageHeader
        title={`${report.reportNumber}${report.purpose ? ` — ${report.purpose}` : ""}`}
        description={`${employee?.name ?? "—"}${report.periodFrom ? ` · ${fmt(report.periodFrom)} – ${fmt(report.periodTo)}` : ""} · ${report.status}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-neutral-500">Total claimed</div>
          <div className="text-xl font-bold text-neutral-900">{money(total)}</div>
        </Card>
        <Card>
          <div className="text-xs text-neutral-500">To reimburse</div>
          <div className="text-xl font-bold text-neutral-900">{money(reimbursable)}</div>
        </Card>
        <Card>
          <div className="text-xs text-neutral-500">Already paid by the company</div>
          <div className="text-xl font-bold text-neutral-900">{money(companyPaid)}</div>
        </Card>
      </div>

      {report.decisionNote && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            report.status === "rejected" ? "border-red-200 bg-red-50 text-red-800" : "border-neutral-200 bg-neutral-50 text-neutral-700"
          }`}
        >
          {report.status === "rejected" ? "Sent back" : "Note"}: {report.decisionNote}
        </div>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Expenses</h2>
        {lines.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">No lines yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Vendor / detail</th>
                  <th className="py-2 pr-3">Paid by</th>
                  <th className="py-2 pr-3">Books to</th>
                  <th className="py-2 pr-3 text-right">Claimed</th>
                  {(isFinance || lines.some((l) => l.approvedAmount !== null)) && <th className="py-2 pr-3 text-right">Allowed</th>}
                  {canEditLines && <th className="py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(l.spentOn)}</td>
                    <td className="py-2 pr-3 text-neutral-900">{l.category ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="text-neutral-800">{l.vendor ?? "—"}</div>
                      {l.description && <div className="text-xs text-neutral-500">{l.description}</div>}
                      {l.requiresDetail && !l.description && (
                        <div className="text-xs text-amber-600">needs an explanation</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-neutral-600">{PAID_BY_SHORT[l.paidBy]}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">
                      {l.accountCode ? (
                        <>
                          <span className="font-mono">{l.accountCode}</span>
                          {l.segment && <span className="ml-1 text-neutral-400">{l.segment}</span>}
                        </>
                      ) : (
                        <span className="text-amber-600">no account</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-900">{money(l.amount)}</td>
                    {(isFinance || lines.some((x) => x.approvedAmount !== null)) && (
                      <td className="py-2 pr-3 text-right">
                        {isFinance && report.status === "submitted" ? (
                          <form action={setApprovedAmountAction} className="inline-flex items-center gap-1">
                            <input type="hidden" name="reportId" value={id} />
                            <input type="hidden" name="lineId" value={l.id} />
                            <input
                              name="approvedAmount"
                              defaultValue={l.approvedAmount === null ? "" : l.approvedAmount.toFixed(2)}
                              inputMode="decimal"
                              placeholder="full"
                              className={`w-24 text-right ${inp}`}
                            />
                            <button className="rounded border border-neutral-300 px-1.5 py-1 text-xs text-neutral-600 hover:border-neutral-400">set</button>
                          </form>
                        ) : (
                          <span className="tabular-nums text-neutral-600">
                            {l.approvedAmount === null ? "—" : money(l.approvedAmount)}
                          </span>
                        )}
                      </td>
                    )}
                    {canEditLines && (
                      <td className="py-2 text-right">
                        <form action={removeExpenseLineAction}>
                          <input type="hidden" name="reportId" value={id} />
                          <input type="hidden" name="lineId" value={l.id} />
                          <button className="text-xs text-neutral-400 hover:text-red-600">remove</button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEditLines && (
          <AddLineForm reportId={id} />
        )}
      </Card>

      {canEditLines && (
        <Card>
          <form action={submitExpenseReportAction}>
            <input type="hidden" name="reportId" value={id} />
            <button
              disabled={lines.length === 0 || total <= 0 || missingDetail > 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Submit for approval — {money(total)}
            </button>
            <span className="ml-3 text-xs text-neutral-500">
              {missingDetail > 0
                ? `${missingDetail} line(s) still need an explanation.`
                : "Approval routes by the standard rules for the amount claimed."}
            </span>
          </form>
        </Card>
      )}

      {isFinance && report.status === "submitted" && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Decision</h2>
          <div className="flex flex-wrap items-end gap-3">
            <form action={decideExpenseReportAction} className="flex items-end gap-2">
              <input type="hidden" name="reportId" value={id} />
              <input type="hidden" name="approve" value="1" />
              <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
                Approve {money(total)}
              </button>
            </form>
            <form action={decideExpenseReportAction} className="flex items-end gap-2">
              <input type="hidden" name="reportId" value={id} />
              <input type="hidden" name="approve" value="0" />
              <input name="note" placeholder="what needs fixing" className={`w-56 ${inp}`} />
              <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-red-300 hover:text-red-600">
                Send back
              </button>
            </form>
          </div>
        </Card>
      )}

      {isFinance && report.status === "approved" && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Settle</h2>
          <form action={settleExpenseReportAction}>
            <input type="hidden" name="reportId" value={id} />
            <button
              disabled={missingAccount > 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Settle this report
            </button>
            <span className="ml-3 text-xs text-neutral-500">
              {missingAccount > 0
                ? `${missingAccount} line(s) have no GL account — fix the category first.`
                : reimbursable > 0
                  ? `Raises a ${money(reimbursable)} bill against ${employee?.name}'s vendor record, paid in the next supplier run.${companyPaid > 0 ? ` The ${money(companyPaid)} already on a card books straight to the card.` : ""}`
                  : "Books the company-card spend; nothing to reimburse."}
            </span>
          </form>
        </Card>
      )}

      {report.status === "settled" && (
        <Card>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            Settled.
            {report.billId && (
              <> Reimbursement raised as <Link href={`/accounting/bills/${report.billId}`} className="font-semibold underline">a vendor bill</Link>, payable in the next run.</>
            )}
            {report.journalEntryId && (
              <> Company-card spend <Link href={`/accounting/journal/${report.journalEntryId}`} className="font-semibold underline">posted to the GL</Link>.</>
            )}
          </div>
        </Card>
      )}

      {(isOwner || isFinance) && !["settled", "cancelled"].includes(report.status) && (
        <Card>
          <form action={cancelExpenseReportAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="reportId" value={id} />
            <input name="reason" placeholder="reason" className={`w-48 ${inp}`} />
            <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:border-red-300 hover:text-red-600">
              Cancel report
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}

/** Server component: the add-a-line form, with the live category list. */
async function AddLineForm({ reportId }: { reportId: string }) {
  const categories = await listCategories();
  return (
    <form action={addExpenseLineAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-neutral-200 pt-4">
      <input type="hidden" name="reportId" value={reportId} />
      <label>
        <span className="mb-1 block text-xs font-medium text-neutral-600">Date</span>
        <input name="spentOn" type="date" className={inp} required />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-neutral-600">Category</span>
        <select name="categoryId" className={inp} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-neutral-600">Vendor</span>
        <input name="vendor" className={`w-36 ${inp}`} placeholder="e.g. Marriott" />
      </label>
      <label className="min-w-[12rem] flex-1">
        <span className="mb-1 block text-xs font-medium text-neutral-600">Detail</span>
        <input name="description" className={`w-full ${inp}`} placeholder="what it was for" />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-neutral-600">Paid by</span>
        <select name="paidBy" className={inp} defaultValue="employee">
          {PAID_BY.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-neutral-600">Amount</span>
        <input name="amount" inputMode="decimal" className={`w-28 text-right ${inp}`} placeholder="0.00" required />
      </label>
      <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add</button>
    </form>
  );
}
