import Link from "next/link";
import { DateTime } from "luxon";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { incomeStatement } from "@/lib/accounting/statements";
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
          <span className="text-neutral-700"><span className="font-mono text-neutral-400">{l.code}</span> {l.name}</span>
          <span className="tabular-nums text-neutral-800">{money(l.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-neutral-100 px-4 py-1.5 text-sm font-semibold">
        <span>Total {s.title}</span><span className="tabular-nums">{money(s.total)}</span>
      </div>
    </div>
  );
}

export default async function IncomeStatementPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const now = DateTime.now().setZone(TZ);
  const fromStr = sp.from || now.startOf("year").toFormat("yyyy-LL-dd");
  const toStr = sp.to || now.toFormat("yyyy-LL-dd");
  const from = DateTime.fromISO(fromStr, { zone: TZ }).startOf("day").toJSDate();
  const to = DateTime.fromISO(toStr, { zone: TZ }).endOf("day").toJSDate();

  const { revenue, expenses, netIncome } = await incomeStatement(from, to);

  // Flag if any posted entries in this period are modeled estimates, so figures
  // aren't mistaken for actuals.
  const [est] = await db.select({ n: dsql<number>`count(*)::int` }).from(journalEntries)
    .where(and(eq(journalEntries.status, "posted"), eq(journalEntries.source, "estimate"), dsql`${journalEntries.date} >= ${from}`, dsql`${journalEntries.date} <= ${to}`));
  const hasEstimates = (est?.n ?? 0) > 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link></div>
      <PageHeader title="Income statement" description="Revenue and expenses over a period (profit & loss). From posted journal entries." />

      {hasEstimates && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Includes <strong>modeled expense estimates</strong> (tagged &ldquo;estimate&rdquo; in the journal) — revenue is real from the SAP history, but expenses are scaled estimates. Replace with actuals when an expense/GL export is available.
        </div>
      )}

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">From</span><input name="from" type="date" defaultValue={fromStr} className={inp} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">To</span><input name="to" type="date" defaultValue={toStr} className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
        </form>
      </Card>

      <Card className="p-0">
        <Section s={revenue} />
        <Section s={expenses} />
        <div className={`flex justify-between border-t-2 px-4 py-3 text-base font-bold ${netIncome >= 0 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800"}`}>
          <span>Net {netIncome >= 0 ? "income" : "loss"}</span><span className="tabular-nums">{money(netIncome)}</span>
        </div>
      </Card>
    </div>
  );
}
