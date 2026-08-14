import Link from "next/link";
import { and, gte, lte, isNull, ne, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { invoices, businessPartners } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function SalesTaxReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : ymd(new Date(now.getFullYear(), q * 3, 1));
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : ymd(new Date(now.getFullYear(), q * 3 + 3, 0));

  const rows = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, issueDate: invoices.issueDate, subtotal: invoices.subtotal, taxRate: invoices.taxRate, tax: invoices.tax, total: invoices.total, company: businessPartners.companyName })
    .from(invoices)
    .leftJoin(businessPartners, eq(businessPartners.id, invoices.bpId))
    .where(and(isNull(invoices.voidedAt), ne(invoices.status, "void"), ne(invoices.status, "draft"), gte(invoices.issueDate, new Date(from + "T00:00:00")), lte(invoices.issueDate, new Date(to + "T23:59:59"))))
    .orderBy(asc(invoices.issueDate));

  let taxable = 0, exempt = 0, taxDue = 0, gross = 0;
  for (const r of rows) {
    const sub = Number(r.subtotal);
    gross += sub;
    if (Number(r.taxRate) > 0 || Number(r.tax) > 0) { taxable += sub; taxDue += Number(r.tax); }
    else exempt += sub;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      <PageHeader title="Sales tax report" description="Taxable vs exempt sales and tax collected for a period — drill into any invoice." />

      <form className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-neutral-500">From<input type="date" name="from" defaultValue={from} className={`mt-1 block ${inp}`} /></label>
        <label className="text-xs text-neutral-500">To<input type="date" name="to" defaultValue={to} className={`mt-1 block ${inp}`} /></label>
        <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Run</button>
      </form>

      <div className="grid gap-3 sm:grid-cols-4">
        {[["Gross sales", gross], ["Taxable sales", taxable], ["Exempt sales", exempt], ["Tax collected", taxDue]].map(([label, val]) => (
          <Card key={label as string}><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-xl font-bold text-neutral-900">{money(val as number)}</p></Card>
        ))}
      </div>

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-4 py-3"><h2 className="text-sm font-semibold text-neutral-900">Invoices ({rows.length}) · {fmtDate(new Date(from + "T12:00:00"))} – {fmtDate(new Date(to + "T12:00:00"))}</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400"><tr><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Date</th><th className="px-4 py-2 text-right">Subtotal</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Tax</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No invoices in this period.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2"><Link href={`/accounting/invoices/${r.id}`} className="font-medium text-neutral-900 hover:underline">{r.invoiceNumber}</Link></td>
                <td className="px-4 py-2 text-neutral-600">{r.company ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-500">{r.issueDate ? fmtDate(r.issueDate) : "—"}</td>
                <td className="px-4 py-2 text-right">{money(Number(r.subtotal))}</td>
                <td className="px-4 py-2 text-right text-neutral-500">{Number(r.taxRate) > 0 ? `${(Number(r.taxRate) * 100).toFixed(2)}%` : "exempt"}</td>
                <td className="px-4 py-2 text-right">{money(Number(r.tax))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-neutral-400">Based on issued (non-void) invoices by issue date. Print via your browser for filing.</p>
    </div>
  );
}
