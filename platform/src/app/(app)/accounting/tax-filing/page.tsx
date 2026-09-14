import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { taxFiling, taxCodeList, exemptCustomers } from "@/lib/accounting/tax";
import { fiscalStartMonth } from "@/lib/accounting/fiscal-service";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const moneyR = (n: number) => `$${Math.round(n).toLocaleString()}`;
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export default async function TaxFilingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireModule("accounting");
  const sp = await searchParams;
  await fiscalStartMonth();

  const now = DateTime.now().setZone(TZ);
  // Returns are filed monthly, so default to the month just gone.
  const lastMonth = now.minus({ months: 1 });
  const fromStr = sp.from || lastMonth.startOf("month").toFormat("yyyy-LL-dd");
  const toStr = sp.to || lastMonth.endOf("month").toFormat("yyyy-LL-dd");
  const from = DateTime.fromISO(fromStr, { zone: TZ }).startOf("day").toJSDate();
  const to = DateTime.fromISO(toStr, { zone: TZ }).endOf("day").toJSDate();

  const [filing, codes, exempt] = await Promise.all([taxFiling(from, to), taxCodeList(), exemptCustomers()]);
  const filed = filing.rows.filter((r) => r.invoices > 0 || r.taxCollected !== 0);
  const expiredCerts = exempt.filter((e) => e.expired);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden">
        <PageHeader
          title="Sales tax filing"
          description="Taxable sales, exempt sales and tax collected per state for the period — the worksheet each state return is typed from."
        />
      </div>

      <Card className="print:hidden">
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {[0, 1, 2].map((back) => {
            const m = now.minus({ months: back + 1 });
            return (
              <Link
                key={back}
                href={`/accounting/tax-filing?from=${m.startOf("month").toFormat("yyyy-LL-dd")}&to=${m.endOf("month").toFormat("yyyy-LL-dd")}`}
                className="rounded-md border border-neutral-300 px-2.5 py-1 text-neutral-600 hover:border-neutral-400 hover:text-neutral-900"
              >
                {m.toFormat("LLLL yyyy")}
              </Link>
            );
          })}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">From</span><input name="from" type="date" defaultValue={fromStr} className={inp} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">To</span><input name="to" type="date" defaultValue={toStr} className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Taxable sales" value={moneyR(filing.totals.taxableSales)} />
        <StatCard label="Exempt sales" value={moneyR(filing.totals.exemptSales)} />
        <StatCard label="Tax collected" value={moneyR(filing.totals.taxCollected)} />
        <StatCard label="Net tax due" value={moneyR(filing.totals.netTaxDue)} />
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">
          {DateTime.fromISO(fromStr).toFormat("LLL d, yyyy")} – {DateTime.fromISO(toStr).toFormat("LLL d, yyyy")}
        </h2>
        <p className="mb-3 text-xs text-neutral-500">Credit memos raised in the same period are netted off what is remitted.</p>

        {filed.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No taxable activity in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Jurisdiction</th>
                  <th className="py-2 pr-3 text-right">Rate</th>
                  <th className="py-2 pr-3 text-right">Invoices</th>
                  <th className="py-2 pr-3 text-right">Taxable sales</th>
                  <th className="py-2 pr-3 text-right">Exempt sales</th>
                  <th className="py-2 pr-3 text-right">Tax collected</th>
                  <th className="py-2 pr-3 text-right">Credits</th>
                  <th className="py-2 text-right">Net due</th>
                </tr>
              </thead>
              <tbody>
                {filed.map((r) => (
                  <tr key={r.code} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      <span className="font-medium text-neutral-900">{r.name}</span>{" "}
                      <span className="font-mono text-[11px] text-neutral-400">{r.code}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{(r.rate * 100).toFixed(3)}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{r.invoices}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-900">{money(r.taxableSales)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">{money(r.exemptSales)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-900">{money(r.taxCollected)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">{r.creditsTax ? `(${money(r.creditsTax)})` : "—"}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-neutral-900">{money(r.netTaxDue)}</td>
                  </tr>
                ))}
                <tr className="border-t border-neutral-300 font-semibold text-neutral-900">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3" />
                  <td className="py-2 pr-3 text-right tabular-nums">{filing.totals.invoices}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(filing.totals.taxableSales)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(filing.totals.exemptSales)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(filing.totals.taxCollected)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{filing.totals.creditsTax ? `(${money(filing.totals.creditsTax)})` : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{money(filing.totals.netTaxDue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {filing.untaxed.invoices > 0 && (
          <p className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            {filing.untaxed.invoices} invoice{filing.untaxed.invoices === 1 ? "" : "s"} worth {money(filing.untaxed.sales)} carried no
            jurisdiction — either genuinely outside nexus, or a customer whose tax code was never set.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Where tax is collected</h2>
          <p className="mb-3 text-xs text-neutral-500">State rates, and how many customers sit in each.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">State</th>
                  <th className="py-2 pr-3 text-right">Rate</th>
                  <th className="py-2 text-right">Customers</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 font-mono text-xs text-neutral-600">{c.code}</td>
                    <td className="py-2 pr-3 text-neutral-900">{c.name}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{c.exempt ? "—" : `${(c.rate * 100).toFixed(3)}%`}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-700">{c.customers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Exemption certificates</h2>
          <p className="mb-3 text-xs text-neutral-500">Customers billed untaxed on a resale or exemption certificate.</p>
          {exempt.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">No exemption certificates recorded.</p>
          ) : (
            <>
              {expiredCerts.length > 0 && (
                <p className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {expiredCerts.length} certificate{expiredCerts.length === 1 ? " has" : "s have"} expired — those accounts should be taxed until a new one is on file.
                </p>
              )}
              <ul className="space-y-1 text-sm">
                {exempt.slice(0, 20).map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3">
                    <Link href={`/crm/${e.id}`} className="truncate text-neutral-800 hover:text-brand">{e.name}</Link>
                    <span className={`shrink-0 text-xs ${e.expired ? "font-medium text-amber-700" : "text-neutral-500"}`}>
                      {e.certificate ?? "no cert #"}{e.expires ? ` · ${e.expired ? "expired" : "expires"} ${e.expires}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
