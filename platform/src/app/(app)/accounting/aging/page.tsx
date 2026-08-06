import Link from "next/link";
import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { invoices, payments, businessPartners } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { AGING_BUCKETS, agingBucket, type AgingBucket } from "@/lib/accounting/ar";
import { StatementDoc, StatementPrintStyles, fmtAcct } from "@/components/accounting/statement";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const COMPANY = "Great Mountain West";
const amt = (n: number) => (n ? fmtAcct(n) : "");
const BUCKET_LABEL: Record<AgingBucket, string> = { current: "Current", "1-30": "1–30", "31-60": "31–60", "61-90": "61–90", "90+": "90+" };

export default async function AgingPage() {
  await requireModule("accounting");
  const now = new Date();

  const openInvoices = await db
    .select({ id: invoices.id, bpId: invoices.bpId, total: invoices.total, dueDate: invoices.dueDate, company: businessPartners.companyName })
    .from(invoices)
    .leftJoin(businessPartners, eq(invoices.bpId, businessPartners.id))
    .where(isNull(invoices.voidedAt));
  const ids = openInvoices.map((i) => i.id);
  const paidRows = ids.length ? await db.select({ invoiceId: payments.invoiceId, paid: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(and(inArray(payments.invoiceId, ids))).groupBy(payments.invoiceId) : [];
  const paidBy = new Map(paidRows.map((p) => [p.invoiceId, Number(p.paid)]));

  type Row = { company: string; bpId: string | null; buckets: Record<AgingBucket, number>; total: number };
  const byCustomer = new Map<string, Row>();
  const totals: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let grand = 0;

  for (const inv of openInvoices) {
    const balance = Number(inv.total) - (paidBy.get(inv.id) ?? 0);
    if (balance <= 0.005) continue;
    const key = inv.bpId ?? "none";
    let row = byCustomer.get(key);
    if (!row) byCustomer.set(key, (row = { company: inv.company ?? "—", bpId: inv.bpId, buckets: { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }, total: 0 }));
    const b = agingBucket(inv.dueDate, now);
    row.buckets[b] += balance;
    row.total += balance;
    totals[b] += balance;
    grand += balance;
  }

  const rows = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const period = `As of ${DateTime.fromJSDate(now).setZone("America/Denver").toFormat("LLLL d, yyyy")}`;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden"><PageHeader title="AR Aging" description="Open receivables by customer and days past due." /></div>

      <StatementPrintStyles />
      <div id="statement-print">
        <StatementDoc company={COMPANY} title="Accounts Receivable Aging" period={period} wide>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] font-serif text-sm">
              <thead>
                <tr className="border-b border-neutral-400 text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-1 text-left font-semibold">Customer</th>
                  {AGING_BUCKETS.map((b) => <th key={b} className="py-1 text-right font-semibold">{BUCKET_LABEL[b]}</th>)}
                  <th className="py-1 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-400">No open receivables.</td></tr>}
                {rows.map((r) => (
                  <tr key={r.bpId ?? r.company} className="border-b border-neutral-100">
                    <td className="py-1">{r.bpId ? <Link href={`/reports/standard/credit/${r.bpId}`} className="hover:underline">{r.company}</Link> : r.company}</td>
                    {AGING_BUCKETS.map((b) => <td key={b} className={`py-1 text-right tabular-nums ${b === "90+" && r.buckets[b] ? "font-semibold text-red-700" : ""}`}>{amt(r.buckets[b])}</td>)}
                    <td className="py-1 text-right font-semibold tabular-nums">{amt(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="font-semibold">
                    <td className="pt-2">Total</td>
                    {AGING_BUCKETS.map((b) => <td key={b} className="pt-2 text-right tabular-nums"><span className="border-t border-neutral-500 pt-0.5">{amt(totals[b])}</span></td>)}
                    <td className="pt-2 text-right tabular-nums"><span className="border-t border-b-4 border-double border-neutral-800 px-0.5 py-0.5">{fmtAcct(grand, true)}</span></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </StatementDoc>
      </div>
    </div>
  );
}
