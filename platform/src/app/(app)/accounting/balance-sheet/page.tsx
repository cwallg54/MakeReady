import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { balanceSheet } from "@/lib/accounting/statements";
import type { StatementGroup } from "@/lib/accounting/statements";
import { StatementDoc, StatementPrintStyles, SectionHead, LineItem, Subtotal, SectionTotal, GrandTotal, Spacer } from "@/components/accounting/statement";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const COMPANY = "Great Mountain West";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

function Groups({ groups, showSubtotals }: { groups: StatementGroup[]; showSubtotals: boolean }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.label}>
          {g.label && <SectionHead indent={1}>{g.label}</SectionHead>}
          {g.lines.map((l) => <LineItem key={l.id} code={l.code} name={l.name} amount={l.amount} indent={2} />)}
          {showSubtotals && g.label && <Subtotal label={`Total ${g.label}`} amount={g.total} indent={1} />}
        </div>
      ))}
    </>
  );
}

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const now = DateTime.now().setZone(TZ);
  const asOfStr = sp.asOf || now.toFormat("yyyy-LL-dd");
  const asOf = DateTime.fromISO(asOfStr, { zone: TZ }).endOf("day").toJSDate();

  const b = await balanceSheet(asOf);
  const period = `As of ${DateTime.fromJSDate(asOf).toFormat("LLLL d, yyyy")}`;
  const multiAsset = b.assets.groups.length > 1;
  const multiLiab = b.liabilities.groups.length > 1;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden">
        <PageHeader title="Balance Sheet" description="Assets, liabilities, and equity as of a date, from posted journal entries." />
      </div>

      <Card className="print:hidden">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">As of</span><input name="asOf" type="date" defaultValue={asOfStr} className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
        </form>
      </Card>

      <StatementPrintStyles />
      <div id="statement-print">
        <StatementDoc company={COMPANY} title="Balance Sheet" period={period}>
          <SectionHead>Assets</SectionHead>
          <Groups groups={b.assets.groups} showSubtotals={multiAsset} />
          <GrandTotal label="Total Assets" amount={b.assets.total} />
          <Spacer />

          <SectionHead>Liabilities</SectionHead>
          <Groups groups={b.liabilities.groups} showSubtotals={multiLiab} />
          <SectionTotal label="Total Liabilities" amount={b.liabilities.total} />
          <Spacer />

          <SectionHead>Equity</SectionHead>
          {b.equity.lines.map((l) => <LineItem key={l.id} code={l.code} name={l.name} amount={l.amount} indent={2} />)}
          <SectionTotal label="Total Equity" amount={b.equity.total} />
          <Spacer />

          <GrandTotal label="Total Liabilities & Equity" amount={b.totalLiabEquity} />

          {!b.balanced && <p className="mt-4 text-center text-xs font-semibold text-red-600">Out of balance — assets do not equal liabilities plus equity. Check for unbalanced postings.</p>}
        </StatementDoc>
      </div>
    </div>
  );
}
