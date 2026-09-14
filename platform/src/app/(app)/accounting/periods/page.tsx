import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries, journalLines, fiscalPeriods } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { listFiscalYears, periodsWithRange, fiscalStartMonth } from "@/lib/accounting/fiscal-service";
import { fiscalYearLabel } from "@/lib/accounting/fiscal";
import { setPeriodStatusAction, setYearStatusAction, createFiscalYearAction } from "@/lib/accounting/period-actions";

export const dynamic = "force-dynamic";

const money = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const STATUS_STYLE: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closing: "bg-amber-50 text-amber-700 border-amber-200",
  locked: "bg-neutral-100 text-neutral-600 border-neutral-200",
};
const STATUS_LABEL: Record<string, string> = { open: "Open", closing: "Closing", locked: "Locked" };

export default async function FiscalPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string }>;
}) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { fy } = await searchParams;

  const startMonth = await fiscalStartMonth();
  const years = await listFiscalYears();
  if (!years.length) redirect("/accounting");

  const today = new Date().toISOString().slice(0, 10);
  const current = await db.query.fiscalPeriods.findFirst({
    where: and(lte(fiscalPeriods.startDate, today), gte(fiscalPeriods.endDate, today)),
  });

  const selectedYear = Number(fy) || (current ? years.find((y) => y.id === current.fiscalYearId)?.year ?? years[0].year : years[0].year);
  const periods = await periodsWithRange(selectedYear);
  const yearRow = years.find((y) => y.year === selectedYear);

  // Posted activity per period, so the close screen shows what is actually in
  // each month before anyone locks it.
  const activity = await db
    .select({
      periodId: journalEntries.periodId,
      entries: sql<string>`COUNT(DISTINCT ${journalEntries.id})`,
      debits: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)`,
    })
    .from(journalEntries)
    .leftJoin(journalLines, eq(journalLines.entryId, journalEntries.id))
    .where(eq(journalEntries.status, "posted"))
    .groupBy(journalEntries.periodId);
  const byPeriod = new Map(activity.map((a) => [a.periodId, { entries: Number(a.entries), debits: Number(a.debits) }]));

  const nextYear = Math.max(...years.map((y) => y.year)) + 1;

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Fiscal periods"
        description={`The financial year runs ${startMonth === 10 ? "October through September" : "on the configured calendar"}. Lock a period to freeze its books; keep the month you are closing in "Closing" so adjustments can still post.`}
      />

      {/* Year picker */}
      <div className="flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <Link
            key={y.id}
            href={`/accounting/periods?fy=${y.year}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              y.year === selectedYear
                ? "border-neutral-900 bg-neutral-900 font-semibold text-white"
                : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
            }`}
          >
            FY{y.year}
          </Link>
        ))}
        {editable && (
          <form action={createFiscalYearAction} className="ml-2">
            <input type="hidden" name="year" value={nextYear} />
            <button className="rounded-md border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700">
              + FY{nextYear}
            </button>
          </form>
        )}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">{fiscalYearLabel(selectedYear, startMonth)}</h2>
            {yearRow && (
              <p className="text-xs text-neutral-500">
                {yearRow.startDate} → {yearRow.endDate} · year status{" "}
                <span className="font-medium">{STATUS_LABEL[yearRow.status]}</span>
              </p>
            )}
          </div>
          {editable && yearRow && (
            <form action={setYearStatusAction} className="flex items-center gap-2">
              <input type="hidden" name="yearId" value={yearRow.id} />
              <input type="hidden" name="status" value={yearRow.status === "locked" ? "open" : "locked"} />
              <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:border-neutral-400">
                {yearRow.status === "locked" ? "Reopen whole year" : "Lock whole year"}
              </button>
            </form>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4">Month</th>
                <th className="py-2 pr-4">Quarter</th>
                <th className="py-2 pr-4">Dates</th>
                <th className="py-2 pr-4 text-right">Entries</th>
                <th className="py-2 pr-4 text-right">Posted (Dr)</th>
                <th className="py-2 pr-4">Status</th>
                {editable && <th className="py-2 text-right">Set to</th>}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => {
                const act = byPeriod.get(p.id);
                const isCurrent = current?.id === p.id;
                return (
                  <tr key={p.id} className={`border-b border-neutral-100 ${isCurrent ? "bg-brand/5" : ""}`}>
                    <td className="py-2 pr-4 font-mono text-xs text-neutral-500">{p.code}</td>
                    <td className="py-2 pr-4 font-medium text-neutral-900">
                      {p.name}
                      {isCurrent && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">current</span>}
                    </td>
                    <td className="py-2 pr-4 text-neutral-500">Q{p.quarter}</td>
                    <td className="py-2 pr-4 text-xs text-neutral-500">{p.startDate} → {p.endDate}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-neutral-700">{act?.entries ?? 0}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-neutral-700">{money(act?.debits ?? 0)}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    {editable && (
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {(["open", "closing", "locked"] as const)
                            .filter((s) => s !== p.status)
                            .map((s) => (
                              <form action={setPeriodStatusAction} key={s}>
                                <input type="hidden" name="periodId" value={p.id} />
                                <input type="hidden" name="status" value={s} />
                                <button className="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-400 hover:text-neutral-900">
                                  {STATUS_LABEL[s]}
                                </button>
                              </form>
                            ))}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">What the statuses mean</h2>
        <ul className="space-y-1.5 text-xs text-neutral-600">
          <li><strong className="text-emerald-700">Open</strong> — anything can post. Normal day-to-day trading.</li>
          <li><strong className="text-amber-700">Closing</strong> — the month is being closed. Adjustments still post, so accruals and corrections can go in, but everyone can see it is being finalised.</li>
          <li><strong className="text-neutral-700">Locked</strong> — the books are frozen. Nothing can be posted, voided, or reversed into the period; auto-postings from invoices, bills and payments dated in it are skipped.</li>
        </ul>
      </Card>
    </div>
  );
}
