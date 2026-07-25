import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, crmScopedToOwn } from "@/lib/rbac";
import { db } from "@/db";
import { quotes, orderFormTemplates, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  converted: "bg-purple-100 text-purple-700",
};

export default async function SalesPage() {
  const user = await requireModule("sales");
  const editable = canEdit(user.roles, "sales");
  const scoped = crmScopedToOwn(user.roles);

  const conditions: SQL[] = [];
  if (scoped) conditions.push(eq(quotes.createdBy, user.id));

  const rows = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      status: quotes.status,
      total: quotes.total,
      createdAt: quotes.createdAt,
      template: orderFormTemplates.name,
      company: businessPartners.companyName,
    })
    .from(quotes)
    .leftJoin(orderFormTemplates, eq(quotes.templateId, orderFormTemplates.id))
    .leftJoin(businessPartners, eq(quotes.bpId, businessPartners.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(quotes.createdAt))
    .limit(200);

  return (
    <div>
      <PageHeader
        title="Sales — Quotes"
        description="Build quotes from product templates with automatic pricing."
        action={editable ? <Link href="/sales/quotes/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New quote</Link> : null}
      />
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-5 py-2 font-medium">Quote #</th>
                <th className="px-5 py-2 font-medium">Customer</th>
                <th className="px-5 py-2 font-medium">Product</th>
                <th className="px-5 py-2 font-medium">Status</th>
                <th className="px-5 py-2 font-medium">Total</th>
                <th className="px-5 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-neutral-400">No quotes yet. Create one to get started.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3 font-mono text-xs"><Link href={`/sales/quotes/${r.id}`} className="font-medium text-neutral-900 hover:underline">{r.quoteNumber}</Link></td>
                  <td className="px-5 py-3 text-neutral-700">{r.company ?? "—"}</td>
                  <td className="px-5 py-3 text-neutral-600">{r.template ?? "—"}</td>
                  <td className="px-5 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                  <td className="px-5 py-3 text-neutral-800">${Number(r.total).toFixed(2)}</td>
                  <td className="px-5 py-3 text-neutral-500">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
