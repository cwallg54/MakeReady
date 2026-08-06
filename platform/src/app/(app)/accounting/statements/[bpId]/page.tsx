import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getCreditAR } from "@/lib/reports/standard-data";
import { emailStatementAction } from "@/lib/accounting/actions";
import { StatementDoc, StatementPrintStyles, fmtAcct, GrandTotal } from "@/components/accounting/statement";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const COMPANY = "Great Mountain West";
const amt = (n: number) => (n ? fmtAcct(n) : "");

export default async function StatementPage({ params }: { params: Promise<{ bpId: string }> }) {
  const user = await requireModule("accounting");
  const { bpId } = await params;
  const now = new Date();
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId) });
  if (!bp) notFound();
  const ar = await getCreditAR(bpId, now);
  const editable = canEdit(user.roles, "accounting");
  const period = `As of ${DateTime.fromJSDate(now).setZone("America/Denver").toFormat("LLLL d, yyyy")}`;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/accounting/statements" className="text-sm text-neutral-500 hover:text-neutral-900">← Statements</Link>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton />
          <Link href={`/accounting/statements/${bpId}/pdf`} target="_blank" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">PDF ↓</Link>
          {editable && (
            <form action={emailStatementAction}><input type="hidden" name="bpId" value={bpId} />
              <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Email statement</button>
            </form>
          )}
        </div>
      </div>
      <div className="print:hidden"><PageHeader title={`Statement — ${bp.companyName}`} description={`As of ${fmtDate(now)}`} /></div>

      <StatementPrintStyles />
      <div id="statement-print">
        <StatementDoc company={COMPANY} title="Statement of Account" subtitle={bp.companyName} period={period}>
          <h3 className="mb-2 border-b border-neutral-300 pb-1 text-sm font-bold">Open Invoices</h3>
          {ar.openInvoices.length === 0 ? (
            <p className="py-2 text-sm text-neutral-500">Account is current — no open invoices.</p>
          ) : (
            <table className="w-full font-serif text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-1 text-left font-semibold">Invoice</th>
                  <th className="py-1 text-left font-semibold">Issued</th>
                  <th className="py-1 text-left font-semibold">Due</th>
                  <th className="py-1 text-left font-semibold">Aging</th>
                  <th className="py-1 text-right font-semibold">Amount</th>
                  <th className="py-1 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {ar.openInvoices.map((i) => (
                  <tr key={i.id} className="border-t border-neutral-100">
                    <td className="py-1"><Link href={`/accounting/invoices/${i.id}`} className="hover:underline">{i.invoiceNumber}</Link></td>
                    <td className="py-1 text-neutral-500">{i.issueDate ? fmtDate(i.issueDate) : "—"}</td>
                    <td className="py-1 text-neutral-500">{i.dueDate ? fmtDate(i.dueDate) : "—"}</td>
                    <td className={`py-1 ${i.bucket === "90+" ? "font-semibold text-red-700" : "text-neutral-500"}`}>{i.bucket}</td>
                    <td className="py-1 text-right tabular-nums text-neutral-600">{amt(i.total)}</td>
                    <td className="py-1 text-right tabular-nums font-medium">{amt(i.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-4">
            <GrandTotal label="Balance Due" amount={ar.totalAR} />
          </div>

          <h3 className="mb-2 mt-6 border-b border-neutral-300 pb-1 text-sm font-bold">Aging Summary</h3>
          <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
            {ar.agingBuckets.map((b) => (
              <span key={b} className="text-neutral-600">{b}: <span className="font-semibold tabular-nums text-neutral-900">{amt(ar.aging[b]) || fmtAcct(0)}</span></span>
            ))}
          </div>

          <p className="mt-8 text-center text-[11px] text-neutral-400">Please remit payment to Great Mountain West. Thank you for your business.</p>
        </StatementDoc>
      </div>
    </div>
  );
}
