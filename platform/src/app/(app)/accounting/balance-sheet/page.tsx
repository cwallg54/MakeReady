import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { balanceSheet } from "@/lib/accounting/statements";
import type { StatementSection } from "@/lib/accounting/statements";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

function Section({ s }: { s: StatementSection }) {
  return (
    <div className="border-t border-neutral-100 first:border-t-0">
      <div className="bg-neutral-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.title}</div>
      {s.lines.length === 0 && <div className="px-4 py-2 text-sm text-neutral-400">None</div>}
      {s.lines.map((l) => (
        <div key={l.id} className="flex justify-between px-4 py-1.5 text-sm">
          <span className="text-neutral-700">{l.code && <span className="font-mono text-neutral-400">{l.code}</span>} {l.name}</span>
          <span className="tabular-nums text-neutral-800">{money(l.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-neutral-100 px-4 py-1.5 text-sm font-semibold">
        <span>Total {s.title}</span><span className="tabular-nums">{money(s.total)}</span>
      </div>
    </div>
  );
}

export default async function BalanceSheetPage({ searchParams }: { searchParams: Promise<{ asOf?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const now = DateTime.now().setZone(TZ);
  const asOfStr = sp.asOf || now.toFormat("yyyy-LL-dd");
  const asOf = DateTime.fromISO(asOfStr, { zone: TZ }).endOf("day").toJSDate();

  const { assets, liabilities, equity, liabilitiesAndEquity, balanced } = await balanceSheet(asOf);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link></div>
      <PageHeader title="Balance sheet" description="Assets, liabilities, and equity as of a date. From posted journal entries." />

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">As of</span><input name="asOf" type="date" defaultValue={asOfStr} className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
        </form>
      </Card>

      <Card className="p-0">
        <Section s={assets} />
        <div className="flex justify-between border-t-2 border-neutral-300 bg-neutral-100 px-4 py-2.5 text-sm font-bold">
          <span>Total assets</span><span className="tabular-nums">{money(assets.total)}</span>
        </div>
      </Card>

      <Card className="p-0">
        <Section s={liabilities} />
        <Section s={equity} />
        <div className="flex justify-between border-t-2 border-neutral-300 bg-neutral-100 px-4 py-2.5 text-sm font-bold">
          <span>Total liabilities &amp; equity</span><span className="tabular-nums">{money(liabilitiesAndEquity)}</span>
        </div>
      </Card>

      {!balanced && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          Out of balance: assets {money(assets.total)} vs. liabilities + equity {money(liabilitiesAndEquity)}. Check for unbalanced or missing postings.
        </div>
      )}
    </div>
  );
}
