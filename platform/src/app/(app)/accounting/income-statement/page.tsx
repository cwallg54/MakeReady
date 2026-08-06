import Link from "next/link";
import { DateTime } from "luxon";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { incomeStatement } from "@/lib/accounting/statements";
import { StatementDoc, StatementPrintStyles, SectionHead, LineItem, SectionTotal, GrandTotal, Spacer } from "@/components/accounting/statement";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const COMPANY = "Great Mountain West";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function IncomeStatementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const now = DateTime.now().setZone(TZ);
  const fromStr = sp.from || now.startOf("year").toFormat("yyyy-LL-dd");
  const toStr = sp.to || now.toFormat("yyyy-LL-dd");
  const from = DateTime.fromISO(fromStr, { zone: TZ }).startOf("day").toJSDate();
  const to = DateTime.fromISO(toStr, { zone: TZ }).endOf("day").toJSDate();

  const s = await incomeStatement(from, to);

  const [est] = await db.select({ n: dsql<number>`count(*)::int` }).from(journalEntries)
    .where(and(eq(journalEntries.status, "posted"), eq(journalEntries.source, "estimate"), dsql`${journalEntries.date} >= ${from}`, dsql`${journalEntries.date} <= ${to}`));
  const hasEstimates = (est?.n ?? 0) > 0;

  const period = `For the Period ${DateTime.fromJSDate(from).toFormat("LLL d, yyyy")} – ${DateTime.fromJSDate(to).toFormat("LLL d, yyyy")}`;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden">
        <PageHeader title="Income Statement" description="Profit & loss over a period, from posted journal entries." />
      </div>

      <Card className="print:hidden">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">From</span><input name="from" type="date" defaultValue={fromStr} className={inp} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">To</span><input name="to" type="date" defaultValue={toStr} className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
        </form>
      </Card>

      {hasEstimates && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 print:hidden">
          Revenue is real (from the SAP history); operating expenses shown here are <strong>modeled estimates</strong>. Replace with actuals when an expense/GL export is available.
        </div>
      )}

      <StatementPrintStyles />
      <div id="statement-print">
        <StatementDoc company={COMPANY} title="Income Statement" period={period}>
          <SectionHead>Revenue</SectionHead>
          {s.revenue.lines.map((l) => <LineItem key={l.id} code={l.code} name={l.name} amount={l.amount} />)}
          <SectionTotal label="Total Revenue" amount={s.revenue.total} />
          <Spacer />

          <SectionHead>Cost of Goods Sold</SectionHead>
          {s.cogs.lines.length === 0 && <LineItem name="—" amount={0} />}
          {s.cogs.lines.map((l) => <LineItem key={l.id} code={l.code} name={l.name} amount={l.amount} />)}
          <SectionTotal label="Total Cost of Goods Sold" amount={s.cogs.total} />
          <Spacer />

          <SectionTotal label="Gross Profit" amount={s.grossProfit} />
          <Spacer />

          <SectionHead>Operating Expenses</SectionHead>
          {s.operating.lines.length === 0 && <LineItem name="—" amount={0} />}
          {s.operating.lines.map((l) => <LineItem key={l.id} code={l.code} name={l.name} amount={l.amount} />)}
          <SectionTotal label="Total Operating Expenses" amount={s.operating.total} />
          <Spacer />

          <GrandTotal label={s.netIncome >= 0 ? "Net Income" : "Net Loss"} amount={s.netIncome} />

          {hasEstimates && <p className="mt-6 text-center text-[11px] italic text-neutral-400">Operating expenses are modeled estimates; revenue is actual.</p>}
        </StatementDoc>
      </div>
    </div>
  );
}
