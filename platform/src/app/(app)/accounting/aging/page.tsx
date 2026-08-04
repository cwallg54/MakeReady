import Link from "next/link";
import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { invoices, payments, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { AGING_BUCKETS, agingBucket, type AgingBucket } from "@/lib/accounting/ar";

export const dynamic = "force-dynamic";

const money = (n: number) => (n ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");

const BUCKET_LABEL: Record<AgingBucket, string> = { current: "Current", "1-30": "1–30", "31-60": "31–60", "61-90": "61–90", "90+": "90+" };

export default async function AgingPage() {
  await requireModule("accounting");
  const now = new Date();

  // Open (non-void) invoices and their applied payments.
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

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="AR Aging" description="Open receivables by customer and days past due." />
      <Card className="p-0 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
              <th className="px-4 py-2">Customer</th>
              {AGING_BUCKETS.map((b) => <th key={b} className="px-4 py-2 text-right">{BUCKET_LABEL[b]}</th>)}
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No open receivables.</td></tr>}
            {rows.map((r) => (
              <tr key={r.bpId ?? r.company}>
                <td className="px-4 py-2 text-neutral-800">{r.bpId ? <Link href={`/reports/standard/credit/${r.bpId}`} className="text-brand-ink hover:underline">{r.company}</Link> : r.company}</td>
                {AGING_BUCKETS.map((b) => <td key={b} className={`px-4 py-2 text-right tabular-nums ${b === "90+" && r.buckets[b] ? "font-semibold text-red-600" : "text-neutral-600"}`}>{money(r.buckets[b])}</td>)}
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-neutral-900">{money(r.total)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-neutral-300 font-semibold text-neutral-900">
                <td className="px-4 py-2">Total</td>
                {AGING_BUCKETS.map((b) => <td key={b} className="px-4 py-2 text-right tabular-nums">{money(totals[b])}</td>)}
                <td className="px-4 py-2 text-right tabular-nums">{money(grand)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}
