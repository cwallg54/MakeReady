import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { cashFlow } from "@/lib/accounting/cashflow";
import type { CashFlowSection } from "@/lib/accounting/cashflow";
import { StatementDoc, StatementPrintStyles, SectionHead, LineItem, SectionTotal, GrandTotal, Spacer, fmtAcct } from "@/components/accounting/statement";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const COMPANY = "Great Mountain West";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

function Activity({ s }: { s: CashFlowSection }) {
  return (
    <>
      <SectionHead>{s.title}</SectionHead>
      {s.lines.length === 0 && <LineItem name="No activity" amount={0} />}
      {s.lines.map((l) => <LineItem key={l.name} name={l.amount >= 0 ? `Cash from ${l.name}` : `Cash paid — ${l.name}`} amount={l.amount} />)}
      <SectionTotal label={`Net cash from ${s.title.replace(" Activities", "").toLowerCase()} activities`} amount={s.total} dollar={false} />
      <Spacer />
    </>
  );
}

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const now = DateTime.now().setZone(TZ);
  const fromStr = sp.from || now.startOf("year").toFormat("yyyy-LL-dd");
  const toStr = sp.to || now.toFormat("yyyy-LL-dd");
  const from = DateTime.fromISO(fromStr, { zone: TZ }).startOf("day").toJSDate();
  const to = DateTime.fromISO(toStr, { zone: TZ }).endOf("day").toJSDate();

  const cf = await cashFlow(from, to);
  const period = `For the Period ${DateTime.fromJSDate(from).toFormat("LLL d, yyyy")} – ${DateTime.fromJSDate(to).toFormat("LLL d, yyyy")}`;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden"><PageHeader title="Cash Flow Statement" description="Cash in and out over a period, by activity — direct method, from posted entries." /></div>

      <Card className="print:hidden">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">From</span><input name="from" type="date" defaultValue={fromStr} className={inp} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">To</span><input name="to" type="date" defaultValue={toStr} className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
        </form>
      </Card>

      <StatementPrintStyles />
      <div id="statement-print">
        <StatementDoc company={COMPANY} title="Statement of Cash Flows" period={period}>
          <Activity s={cf.operating} />
          <Activity s={cf.investing} />
          <Activity s={cf.financing} />
          <SectionTotal label="Net Change in Cash" amount={cf.netChange} />
          <Spacer />
          <LineItem name="Cash, beginning of period" amount={cf.beginning} indent={0} />
          <GrandTotal label="Cash, End of Period" amount={cf.ending} />
        </StatementDoc>
      </div>

      <p className="text-center text-xs text-neutral-400 print:hidden">Reconciles the Cash account&apos;s movements: {fmtAcct(cf.beginning, true)} + {fmtAcct(cf.netChange, true)} = {fmtAcct(cf.ending, true)}.</p>
    </div>
  );
}
