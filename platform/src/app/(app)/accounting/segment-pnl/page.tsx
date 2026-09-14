import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { segmentPnl, type SegmentColumn } from "@/lib/accounting/statements";
import { fiscalStartMonth } from "@/lib/accounting/fiscal-service";
import { buildFiscalYear, fiscalYearOf, quarterRange, ytdRange } from "@/lib/accounting/fiscal";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

const money = (n: number) =>
  n === 0 ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);

const KIND_LABEL: Record<string, string> = {
  product_line: "Product lines",
  department: "Production departments",
  overhead: "Overhead",
  none: "Unsegmented",
};
const KIND_ORDER = ["product_line", "department", "overhead", "none"];

export default async function SegmentPnlPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  await requireModule("accounting");
  const sp = await searchParams;
  const startMonth = await fiscalStartMonth();
  const now = DateTime.now().setZone(TZ);
  const today = now.toFormat("yyyy-LL-dd");

  // Default to fiscal year to date — the way this business reads its numbers.
  const ytd = ytdRange(today, startMonth);
  let fromStr = sp.from || ytd.startDate;
  let toStr = sp.to || today;

  if (sp.preset) {
    const fy = fiscalYearOf(today, startMonth);
    if (sp.preset === "ytd") { fromStr = ytd.startDate; toStr = today; }
    else if (sp.preset === "fy") { const y = buildFiscalYear(fy, startMonth); fromStr = y.startDate; toStr = y.endDate; }
    else if (sp.preset === "lastfy") { const y = buildFiscalYear(fy - 1, startMonth); fromStr = y.startDate; toStr = y.endDate; }
    else if (sp.preset.startsWith("q")) {
      const q = Number(sp.preset.slice(1));
      const r = quarterRange(fy, q, startMonth);
      fromStr = r.startDate; toStr = r.endDate;
    }
  }

  const from = DateTime.fromISO(fromStr, { zone: TZ }).startOf("day").toJSDate();
  const to = DateTime.fromISO(toStr, { zone: TZ }).endOf("day").toJSDate();
  const { columns, total } = await segmentPnl(from, to);

  const grouped = KIND_ORDER.map((kind) => ({ kind, cols: columns.filter((c) => c.kind === kind) })).filter((g) => g.cols.length > 0);
  const fyLabel = `FY${fiscalYearOf(toStr, startMonth)}`;

  const Row = ({ label, pick, bold, indent }: { label: string; pick: (c: SegmentColumn) => string; bold?: boolean; indent?: boolean }) => (
    <tr className={bold ? "border-t border-neutral-300 font-semibold text-neutral-900" : "text-neutral-700"}>
      <td className={`py-1.5 pr-4 ${indent ? "pl-4" : ""}`}>{label}</td>
      {columns.map((c) => (
        <td key={c.code} className="py-1.5 pr-4 text-right tabular-nums">{pick(c)}</td>
      ))}
      <td className="py-1.5 pl-2 text-right tabular-nums font-semibold text-neutral-900">{pick(total)}</td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden">
        <PageHeader
          title="P&L by segment"
          description="Profit and loss split by the segment in each account code — product line, production department and overhead function."
        />
      </div>

      <Card className="print:hidden">
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {[
            { key: "ytd", label: `${fyLabel} to date` },
            { key: "q1", label: "Q1 (Oct–Dec)" },
            { key: "q2", label: "Q2 (Jan–Mar)" },
            { key: "q3", label: "Q3 (Apr–Jun)" },
            { key: "q4", label: "Q4 (Jul–Sep)" },
            { key: "fy", label: `Full ${fyLabel}` },
            { key: "lastfy", label: `FY${fiscalYearOf(toStr, startMonth) - 1}` },
          ].map((p) => (
            <Link
              key={p.key}
              href={`/accounting/segment-pnl?preset=${p.key}`}
              className="rounded-md border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">From</span><input name="from" type="date" defaultValue={fromStr} className={inp} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">To</span><input name="to" type="date" defaultValue={toStr} className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
        </form>
      </Card>

      {columns.length === 0 ? (
        <Card><p className="text-sm text-neutral-500">No posted activity in this period.</p></Card>
      ) : (
        <Card>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-neutral-900">
              {DateTime.fromISO(fromStr).toFormat("LLL d, yyyy")} – {DateTime.fromISO(toStr).toFormat("LLL d, yyyy")}
            </h2>
            <p className="text-xs text-neutral-500">
              {grouped.map((g) => `${g.cols.length} ${KIND_LABEL[g.kind].toLowerCase()}`).join(" · ")}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-4 text-left">&nbsp;</th>
                  {columns.map((c) => (
                    <th key={c.code} className="py-2 pr-4 text-right">
                      <span className="block font-semibold text-neutral-700">{c.short}</span>
                      <span className="block font-mono text-[10px] font-normal text-neutral-400">{c.code}</span>
                    </th>
                  ))}
                  <th className="py-2 pl-2 text-right text-neutral-700">Total</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Revenue" pick={(c) => money(c.revenue)} />
                <Row label="Cost of goods sold" pick={(c) => money(c.cogs)} />
                <Row label="Gross profit" pick={(c) => money(c.grossProfit)} bold />
                <Row label="Gross margin" pick={(c) => pct(c.grossMarginPct)} indent />
                <Row label="Operating expenses" pick={(c) => money(c.operating)} />
                <Row label="Net contribution" pick={(c) => money(c.netIncome)} bold />
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Each column is one account-code segment. Product lines carry revenue and COGS; production
            departments and overhead functions carry costs only, so their net contribution is negative by
            design — the total column is the real bottom line.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Segments in this report</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {grouped.map((g) => (
            <div key={g.kind}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{KIND_LABEL[g.kind]}</div>
              <ul className="space-y-0.5 text-xs text-neutral-600">
                {g.cols.map((c) => (
                  <li key={c.code}>
                    <span className="font-mono text-neutral-400">{c.code}</span> {c.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
