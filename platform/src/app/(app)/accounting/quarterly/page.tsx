import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { quarterlyPack, type QuarterPnl } from "@/lib/accounting/finance-reports";
import { fiscalStartMonth, listFiscalYears } from "@/lib/accounting/fiscal-service";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const QUARTER_MONTHS = ["Oct–Dec", "Jan–Mar", "Apr–Jun", "Jul–Sep"];

function variance(now: number, then: number) {
  const diff = now - then;
  const p = then !== 0 ? (diff / Math.abs(then)) * 100 : null;
  return { diff, pct: p };
}

function VarianceCell({ now, then, goodWhenUp = true }: { now: number; then: number; goodWhenUp?: boolean }) {
  const v = variance(now, then);
  if (v.pct === null) return <td className="py-2 pr-4 text-right text-xs text-neutral-400">—</td>;
  const good = v.diff >= 0 === goodWhenUp;
  return (
    <td className={`py-2 pr-4 text-right text-xs font-medium tabular-nums ${good ? "text-emerald-600" : "text-amber-600"}`}>
      {v.diff >= 0 ? "+" : "−"}{money(Math.abs(v.diff))} ({v.pct >= 0 ? "+" : ""}{v.pct.toFixed(0)}%)
    </td>
  );
}

export default async function QuarterlyPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string; q?: string }>;
}) {
  await requireModule("accounting");
  const sp = await searchParams;
  const startMonth = await fiscalStartMonth();
  const years = await listFiscalYears();

  const pack = await quarterlyPack(sp.fy ? Number(sp.fy) : undefined, sp.q ? Number(sp.q) : undefined);
  const { current, priorYear, ytd, priorYtd, quarters, segments } = pack;

  const Row = ({ label, pick, goodWhenUp = true, bold }: { label: string; pick: (p: QuarterPnl) => number; goodWhenUp?: boolean; bold?: boolean }) => (
    <tr className={bold ? "border-t border-neutral-300 font-semibold text-neutral-900" : "text-neutral-700"}>
      <td className="py-2 pr-4">{label}</td>
      <td className="py-2 pr-4 text-right tabular-nums">{money(pick(current))}</td>
      <td className="py-2 pr-4 text-right tabular-nums text-neutral-500">{money(pick(priorYear))}</td>
      <VarianceCell now={pick(current)} then={pick(priorYear)} goodWhenUp={goodWhenUp} />
      <td className="py-2 pr-4 text-right tabular-nums">{money(pick(ytd))}</td>
      <td className="py-2 pr-4 text-right tabular-nums text-neutral-500">{money(pick(priorYtd))}</td>
      <VarianceCell now={pick(ytd)} then={pick(priorYtd)} goodWhenUp={goodWhenUp} />
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden">
        <PageHeader
          title="Quarterly pack"
          description={`The quarter against the same quarter last year, the year to date, all four quarters side by side, and the segment split. Fiscal year runs ${startMonth === 10 ? "October to September" : "on the configured calendar"}.`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {years.slice(0, 6).map((y) => (
          <Link
            key={y.id}
            href={`/accounting/quarterly?fy=${y.year}&q=${pack.quarter}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${y.year === pack.fiscalYear ? "border-neutral-900 bg-neutral-900 font-semibold text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"}`}
          >
            FY{y.year}
          </Link>
        ))}
        <span className="mx-2 h-5 w-px bg-neutral-200" />
        {[1, 2, 3, 4].map((n) => (
          <Link
            key={n}
            href={`/accounting/quarterly?fy=${pack.fiscalYear}&q=${n}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${n === pack.quarter ? "border-neutral-900 bg-neutral-900 font-semibold text-white" : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"}`}
          >
            Q{n} <span className="text-xs font-normal opacity-70">{QUARTER_MONTHS[n - 1]}</span>
          </Link>
        ))}
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">
          FY{pack.fiscalYear} Q{pack.quarter} · {DateTime.fromISO(current.from).toFormat("LLL d, yyyy")} – {DateTime.fromISO(current.to).toFormat("LLL d, yyyy")}
        </h2>
        <p className="mb-4 text-xs text-neutral-500">Prior-year columns cover the same quarter of FY{pack.fiscalYear - 1}.</p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4 text-left">&nbsp;</th>
                <th className="py-2 pr-4 text-right">Q{pack.quarter}</th>
                <th className="py-2 pr-4 text-right">Q{pack.quarter} LY</th>
                <th className="py-2 pr-4 text-right">Var</th>
                <th className="py-2 pr-4 text-right">YTD</th>
                <th className="py-2 pr-4 text-right">YTD LY</th>
                <th className="py-2 pr-4 text-right">Var</th>
              </tr>
            </thead>
            <tbody>
              <Row label="Revenue" pick={(p) => p.revenue} />
              <Row label="Cost of goods sold" pick={(p) => p.cogs} goodWhenUp={false} />
              <Row label="Gross profit" pick={(p) => p.grossProfit} bold />
              <tr className="text-neutral-500">
                <td className="py-2 pr-4 pl-4">Gross margin</td>
                <td className="py-2 pr-4 text-right tabular-nums">{pct(current.grossMarginPct)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{pct(priorYear.grossMarginPct)}</td>
                <td className="py-2 pr-4" />
                <td className="py-2 pr-4 text-right tabular-nums">{pct(ytd.grossMarginPct)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{pct(priorYtd.grossMarginPct)}</td>
                <td className="py-2 pr-4" />
              </tr>
              <Row label="Operating expenses" pick={(p) => p.operating} goodWhenUp={false} />
              <Row label="Net income" pick={(p) => p.netIncome} bold />
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">FY{pack.fiscalYear} by quarter</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4 text-left">&nbsp;</th>
                {quarters.map((q, i) => (
                  <th key={q.label} className="py-2 pr-4 text-right">
                    <span className="block font-semibold text-neutral-700">{q.label}</span>
                    <span className="block text-[10px] font-normal text-neutral-400">{QUARTER_MONTHS[i]}</span>
                  </th>
                ))}
                <th className="py-2 text-right text-neutral-700">Year</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["Revenue", (q: QuarterPnl) => q.revenue],
                ["COGS", (q: QuarterPnl) => q.cogs],
                ["Gross profit", (q: QuarterPnl) => q.grossProfit],
                ["Operating expenses", (q: QuarterPnl) => q.operating],
                ["Net income", (q: QuarterPnl) => q.netIncome],
              ] as const).map(([label, pick], idx) => (
                <tr key={label} className={idx === 4 ? "border-t border-neutral-300 font-semibold text-neutral-900" : "text-neutral-700"}>
                  <td className="py-2 pr-4">{label}</td>
                  {quarters.map((q) => (
                    <td key={q.label} className="py-2 pr-4 text-right tabular-nums">{money(pick(q))}</td>
                  ))}
                  <td className="py-2 text-right tabular-nums font-semibold text-neutral-900">
                    {money(quarters.reduce((s, q) => s + pick(q), 0))}
                  </td>
                </tr>
              ))}
              <tr className="text-neutral-500">
                <td className="py-2 pr-4 pl-4">Gross margin</td>
                {quarters.map((q) => (
                  <td key={q.label} className="py-2 pr-4 text-right tabular-nums">{pct(q.grossMarginPct)}</td>
                ))}
                <td className="py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Q{pack.quarter} by segment</h2>
        <p className="mb-3 text-xs text-neutral-500">Product lines carry revenue and COGS; departments and overhead carry costs only.</p>
        {segments.columns.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">No posted activity in this quarter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-4 text-left">Segment</th>
                  <th className="py-2 pr-4 text-right">Revenue</th>
                  <th className="py-2 pr-4 text-right">COGS</th>
                  <th className="py-2 pr-4 text-right">Gross</th>
                  <th className="py-2 pr-4 text-right">GM%</th>
                  <th className="py-2 pr-4 text-right">Opex</th>
                  <th className="py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {segments.columns.map((c) => (
                  <tr key={c.code} className="border-b border-neutral-100 text-neutral-700">
                    <td className="py-2 pr-4">
                      <span className="font-medium text-neutral-900">{c.short}</span>{" "}
                      <span className="font-mono text-[11px] text-neutral-400">{c.code}</span>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(c.revenue)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(c.cogs)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(c.grossProfit)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{pct(c.grossMarginPct)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(c.operating)}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-neutral-900">{money(c.netIncome)}</td>
                  </tr>
                ))}
                <tr className="border-t border-neutral-300 font-semibold text-neutral-900">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(segments.total.revenue)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(segments.total.cogs)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(segments.total.grossProfit)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{pct(segments.total.grossMarginPct)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(segments.total.operating)}</td>
                  <td className="py-2 text-right tabular-nums">{money(segments.total.netIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Cash and receivables in the quarter</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs text-neutral-500">Collected</div>
            <div className="text-xl font-bold text-neutral-900">{money(pack.cashIn)}</div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs text-neutral-500">Paid out</div>
            <div className="text-xl font-bold text-neutral-900">{money(pack.cashOut)}</div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs text-neutral-500">Open AR at quarter end</div>
            <div className="text-xl font-bold text-neutral-900">{money(pack.arOpen)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
