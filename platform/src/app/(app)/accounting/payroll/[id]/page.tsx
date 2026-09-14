import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { runDetail } from "@/lib/accounting/payroll";
import { savePayrollAmountsAction, postPayrollRunAction, voidPayrollRunAction } from "@/lib/accounting/payroll-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { id } = await params;

  const detail = await runDetail(id);
  if (!detail) notFound();
  const { run, lines, debits, credits, balanced } = detail;

  const isDraft = run.status === "draft";
  const isAccrual = run.kind === "accrual";
  const groups = [...new Set(lines.map((l) => l.grouping ?? "Other"))];
  const difference = Math.round((debits - credits) * 100) / 100;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm">
        <Link href="/accounting/payroll" className="text-neutral-500 hover:text-neutral-900">← Payroll journals</Link>
      </div>
      <PageHeader
        title={`${run.runNumber} — ${isAccrual ? "accrued payroll" : "payroll"}`}
        description={
          isAccrual
            ? `Accrues on ${run.accrualDate ?? run.payDate} and reverses automatically on the pay date, ${run.payDate}.`
            : `Pay date ${run.payDate}${run.periodStart && run.periodEnd ? ` · period ${run.periodStart} – ${run.periodEnd}` : ""} · ${run.status}`
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs text-neutral-500">Debits</div>
          <div className="text-xl font-bold text-neutral-900">{money(debits)}</div>
        </Card>
        <Card>
          <div className="text-xs text-neutral-500">Credits</div>
          <div className="text-xl font-bold text-neutral-900">{money(credits)}</div>
        </Card>
        <Card>
          <div className="text-xs text-neutral-500">Out by</div>
          <div className={`text-xl font-bold ${balanced ? "text-emerald-700" : "text-amber-700"}`}>
            {balanced ? "balanced" : money(Math.abs(difference))}
          </div>
          {!balanced && difference !== 0 && (
            <div className="text-[11px] text-neutral-500">{difference > 0 ? "debits exceed credits" : "credits exceed debits"}</div>
          )}
        </Card>
      </div>

      <form action={savePayrollAmountsAction}>
        <input type="hidden" name="runId" value={id} />
        <div className="space-y-4">
          {groups.map((g) => {
            const rows = lines.filter((l) => (l.grouping ?? "Other") === g);
            const subtotal = rows.reduce((s, l) => s + l.amount, 0);
            return (
              <Card key={g}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-neutral-900">{g}</h2>
                  <span className="text-sm tabular-nums text-neutral-600">{money(subtotal)}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((l) => (
                      <tr key={l.id} className="border-b border-neutral-100 last:border-0">
                        <td className="py-1.5 pr-3">
                          <span className="text-neutral-900">{l.label}</span>
                          <span className="ml-2 font-mono text-[11px] text-neutral-400">{l.accountCode}</span>
                          {l.segment && <span className="ml-1 text-[11px] text-neutral-400">· {l.segment}</span>}
                        </td>
                        <td className="w-20 py-1.5 pr-3 text-xs text-neutral-400">{l.side === "credit" ? "credit" : "debit"}</td>
                        <td className="w-36 py-1.5 text-right">
                          <input
                            name={`amount[${l.id}]`}
                            defaultValue={l.amount ? l.amount.toFixed(2) : ""}
                            inputMode="decimal"
                            disabled={!editable || !isDraft}
                            placeholder="0.00"
                            className={`w-32 text-right ${inp} disabled:bg-neutral-100`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>

        {editable && isDraft && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-400">
              Save amounts
            </button>
            <span className="text-xs text-neutral-500">Save first, then post once the two sides agree.</span>
          </div>
        )}
      </form>

      {editable && isDraft && (
        <Card>
          <form action={postPayrollRunAction}>
            <input type="hidden" name="runId" value={id} />
            <button
              disabled={!balanced}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Post {isAccrual ? "accrual" : "payroll"} — {money(debits)}
            </button>
            <span className="ml-3 text-xs text-neutral-500">
              {balanced
                ? isAccrual
                  ? `Posts on ${run.accrualDate ?? run.payDate} and reverses on ${run.payDate}.`
                  : `Posts on ${run.payDate}, one journal entry across every department.`
                : "The two sides have to agree before this can post."}
            </span>
          </form>
        </Card>
      )}

      {run.status === "posted" && (
        <Card>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            Posted{run.journalEntryId ? <> — <Link href={`/accounting/journal/${run.journalEntryId}`} className="font-semibold underline">see the journal entry</Link></> : null}
            {isAccrual && <> · reverses on {run.payDate}, which the period close will post.</>}
          </div>
          {editable && (
            <form action={voidPayrollRunAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="runId" value={id} />
              <input name="reason" placeholder="void reason" className={`w-48 ${inp}`} />
              <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:border-red-300 hover:text-red-600">
                Void run
              </button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
