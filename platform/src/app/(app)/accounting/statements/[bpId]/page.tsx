import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getCreditAR } from "@/lib/reports/standard-data";
import { emailStatementAction } from "@/lib/accounting/actions";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function StatementPage({ params }: { params: Promise<{ bpId: string }> }) {
  const user = await requireModule("accounting");
  const { bpId } = await params;
  const now = new Date();
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId) });
  if (!bp) notFound();
  const ar = await getCreditAR(bpId, now);
  const editable = canEdit(user.roles, "accounting");

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/accounting/statements" className="text-sm text-neutral-500 hover:text-neutral-900">← Statements</Link>
      <PageHeader
        title={`Statement — ${bp.companyName}`}
        description={`As of ${fmtDate(now)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/accounting/statements/${bpId}/pdf`} target="_blank" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">PDF ↓</Link>
            {editable && (
              <form action={emailStatementAction}><input type="hidden" name="bpId" value={bpId} />
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Email statement</button>
              </form>
            )}
          </div>
        }
      />

      <Card className="overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Open invoices</h2>
          <span className="text-sm font-semibold text-neutral-900 tabular-nums">{money(ar.totalAR)}</span>
        </div>
        {ar.openInvoices.length === 0 ? (
          <p className="text-sm text-neutral-400">Account is current — no open invoices.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400"><th className="px-2 py-1">Invoice</th><th className="px-2 py-1">Issued</th><th className="px-2 py-1">Due</th><th className="px-2 py-1">Aging</th><th className="px-2 py-1 text-right">Total</th><th className="px-2 py-1 text-right">Balance</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {ar.openInvoices.map((i) => (
                <tr key={i.id}>
                  <td className="px-2 py-1.5"><Link href={`/accounting/invoices/${i.id}`} className="font-medium text-brand-ink hover:underline">{i.invoiceNumber}</Link></td>
                  <td className="px-2 py-1.5 text-neutral-500">{i.issueDate ? fmtDate(i.issueDate) : "—"}</td>
                  <td className="px-2 py-1.5 text-neutral-500">{i.dueDate ? fmtDate(i.dueDate) : "—"}</td>
                  <td className={`px-2 py-1.5 ${i.bucket === "90+" ? "font-semibold text-red-600" : "text-neutral-500"}`}>{i.bucket}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-neutral-600">{money(i.total)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-neutral-900">{money(i.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-3 flex flex-wrap gap-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          {ar.agingBuckets.map((b) => <span key={b}>{b}: <span className="font-medium text-neutral-800 tabular-nums">{money(ar.aging[b])}</span></span>)}
        </div>
      </Card>
    </div>
  );
}
