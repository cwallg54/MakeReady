import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { payments, invoices, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { BpSearchSelect } from "@/components/crm/bp-search-select";
import { fmtDateTime } from "@/lib/format";
import { recordPaymentAction } from "@/lib/accounting/actions";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";
const lbl = "text-xs font-medium text-neutral-500";
const METHODS = ["check", "ach", "card", "cash", "credit", "other"];

export default async function PaymentsPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");

  const rows = await db
    .select({ id: payments.id, amount: payments.amount, method: payments.method, reference: payments.reference, receivedDate: payments.receivedDate, company: businessPartners.companyName, invoiceNumber: invoices.invoiceNumber, invoiceId: payments.invoiceId })
    .from(payments)
    .leftJoin(businessPartners, eq(payments.bpId, businessPartners.id))
    .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
    .orderBy(desc(payments.receivedDate))
    .limit(200);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Payments" description="Customer payments received against invoices or on account." />

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Record an on-account payment</h2>
          <form action={recordPaymentAction} className="flex flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1"><span className={lbl}>Customer</span><div className="mt-1"><BpSearchSelect name="bpId" placeholder="Search customer…" /></div></label>
            <label className="w-28"><span className={lbl}>Amount $</span><input name="amount" type="number" step="0.01" min="0" className={`mt-1 ${inp}`} /></label>
            <label className="w-28"><span className={lbl}>Method</span><select name="method" className={`mt-1 ${inp}`}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            <label className="w-32"><span className={lbl}>Reference</span><input name="reference" placeholder="check #" className={`mt-1 ${inp}`} /></label>
            <label className="w-36"><span className={lbl}>Received</span><input name="receivedDate" type="date" className={`mt-1 ${inp}`} /></label>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Record</button>
          </form>
          <p className="mt-2 text-xs text-neutral-400">To apply a payment to a specific invoice, open the invoice and record it there.</p>
        </Card>
      )}

      <Card className="p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400"><th className="px-4 py-2">Received</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Method</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No payments yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-neutral-600">{fmtDateTime(r.receivedDate)}</td>
                <td className="px-4 py-2 text-neutral-800">{r.company ?? "—"}</td>
                <td className="px-4 py-2">{r.invoiceId ? <Link href={`/accounting/invoices/${r.invoiceId}`} className="text-brand-ink hover:underline">{r.invoiceNumber}</Link> : <span className="text-neutral-400">on account</span>}</td>
                <td className="px-4 py-2 capitalize text-neutral-600">{r.method}{r.reference ? ` · ${r.reference}` : ""}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-700">{money(Number(r.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
