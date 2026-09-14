import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { listRuns, listTemplates, templateLines, payrollBySegment } from "@/lib/accounting/payroll";
import { createPayrollRunAction } from "@/lib/accounting/payroll-actions";
import { ytdRange } from "@/lib/accounting/fiscal";
import { fiscalStartMonth } from "@/lib/accounting/fiscal-service";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

const STATUS_STYLE: Record<string, string> = {
  draft: "border-neutral-200 bg-neutral-100 text-neutral-600",
  posted: "border-emerald-200 bg-emerald-50 text-emerald-700",
  void: "border-neutral-200 bg-neutral-100 text-neutral-400",
};

export default async function PayrollPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const startMonth = await fiscalStartMonth();

  const now = DateTime.now().setZone(TZ);
  const today = now.toFormat("yyyy-LL-dd");
  const ytd = ytdRange(today, startMonth);

  const [templates, runs, bySegment] = await Promise.all([listTemplates(), listRuns(30), payrollBySegment(ytd.startDate, today)]);
  const template = templates.find((t) => t.active) ?? templates[0];
  const lines = template ? await templateLines(template.id) : [];

  // Pay days are the 10th and the 25th; suggest whichever comes next.
  const day = now.day;
  const nextPay = day < 10 ? now.set({ day: 10 }) : day < 25 ? now.set({ day: 25 }) : now.plus({ months: 1 }).set({ day: 10 });
  const priorMonthEnd = nextPay.minus({ months: nextPay.day === 10 ? 0 : 0 }).set({ day: 1 }).minus({ days: 1 });

  const ytdTotal = bySegment.reduce((s, r) => s + r.amount, 0);
  const segments = [...new Set(bySegment.map((r) => r.segment))].map((seg) => ({
    segment: seg,
    amount: bySegment.filter((r) => r.segment === seg).reduce((s, r) => s + r.amount, 0),
  })).sort((a, b) => b.amount - a.amount);

  const groups = [...new Set(lines.map((l) => l.grouping ?? "Other"))];

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Payroll journals"
        description="Payroll posts twice a month across every department, and gets accrued at month end for the run that pays in the next one. The template holds that shape; a run only needs the numbers."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Payroll YTD" value={money(ytdTotal)} />
        <StatCard label="Runs recorded" value={String(runs.filter((r) => r.status === "posted").length)} />
        <StatCard label="Template lines" value={String(lines.length)} />
      </div>

      {editable && template && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Start a run</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Copying the last run brings its amounts forward, so only what actually changed needs typing.
          </p>
          <form action={createPayrollRunAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="templateId" value={template.id} />
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Type</span>
              <select name="kind" className={inp} defaultValue="payroll">
                <option value="payroll">Payroll</option>
                <option value="accrual">Month-end accrual</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Pay date</span>
              <input name="payDate" type="date" defaultValue={nextPay.toFormat("yyyy-LL-dd")} className={inp} required />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Accrue on <span className="text-neutral-400">accruals only</span></span>
              <input name="accrualDate" type="date" defaultValue={priorMonthEnd.toFormat("yyyy-LL-dd")} className={inp} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Period start</span>
              <input name="periodStart" type="date" className={inp} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Period end</span>
              <input name="periodEnd" type="date" className={inp} />
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-neutral-600">
              <input type="checkbox" name="copyLast" value="1" defaultChecked className="h-4 w-4" />
              Copy amounts from the last run
            </label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create run</button>
          </form>
          <p className="mt-2 text-xs text-neutral-500">
            An accrual posts on the accrual date and reverses automatically on the pay date — the close picks it up.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Runs</h2>
        {runs.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No payroll runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Run</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Pay date</th>
                  <th className="py-2 pr-3">Posted on</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      <Link href={`/accounting/payroll/${r.id}`} className="font-mono text-xs text-neutral-700 hover:text-brand">{r.runNumber}</Link>
                    </td>
                    <td className="py-2 pr-3 text-xs text-neutral-600">{r.kind === "accrual" ? "Accrual" : "Payroll"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{r.payDate}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{r.accrualDate ?? r.payDate}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium text-neutral-900">{money(r.total)}</td>
                    <td className="py-2"><span className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {segments.length > 0 && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Payroll by department, year to date</h2>
          <p className="mb-3 text-xs text-neutral-500">Posted payroll runs only — accruals are excluded so nothing is counted twice.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {segments.map((s) => (
              <div key={s.segment} className="rounded-lg border border-neutral-200 p-3">
                <div className="text-xs text-neutral-500">{s.segment}</div>
                <div className="text-lg font-bold text-neutral-900">{money(s.amount)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {template && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">{template.name}</h2>
          <p className="mb-3 text-xs text-neutral-500">{template.description}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{g}</div>
                <ul className="space-y-0.5 text-xs text-neutral-600">
                  {lines.filter((l) => (l.grouping ?? "Other") === g).map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span className="truncate">{l.label}</span>
                      <span className="shrink-0 font-mono text-[11px] text-neutral-400">
                        {l.accountCode}
                        {l.side === "credit" ? " cr" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
