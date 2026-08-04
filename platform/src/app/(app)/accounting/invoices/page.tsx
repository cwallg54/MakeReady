import Link from "next/link";
import { desc, eq, sql, inArray } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { invoices, payments, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { agingBucket } from "@/lib/accounting/ar";

export const dynamic = "force-dynamic";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  sent: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  void: "bg-red-100 text-red-700",
};

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const status = sp.status && ["draft", "sent", "partial", "paid", "void"].includes(sp.status) ? sp.status : null;
  const now = new Date();

  const rows = await db
    .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status, total: invoices.total, dueDate: invoices.dueDate, issueDate: invoices.issueDate, voidedAt: invoices.voidedAt, company: businessPartners.companyName })
    .from(invoices)
    .leftJoin(businessPartners, eq(invoices.bpId, businessPartners.id))
    .where(status ? eq(invoices.status, status as "draft" | "sent" | "partial" | "paid" | "void") : sql`true`)
    .orderBy(desc(invoices.createdAt))
    .limit(200);

  const ids = rows.map((r) => r.id);
  const paidRows = ids.length ? await db.select({ invoiceId: payments.invoiceId, paid: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(inArray(payments.invoiceId, ids)).groupBy(payments.invoiceId) : [];
  const paidBy = new Map(paidRows.map((p) => [p.invoiceId, Number(p.paid)]));

  const TABS: { key: string | null; label: string }[] = [{ key: null, label: "All" }, { key: "draft", label: "Draft" }, { key: "sent", label: "Sent" }, { key: "partial", label: "Partial" }, { key: "paid", label: "Paid" }, { key: "void", label: "Void" }];

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Invoices"
        description="Accounts receivable — bill customers and track what's owed."
        action={<Link href="/accounting/invoices/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New invoice</Link>}
      />
      <div className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <Link key={t.label} href={t.key ? `/accounting/invoices?status=${t.key}` : "/accounting/invoices"} className={`rounded-md border px-3 py-1 ${status === t.key ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{t.label}</Link>
        ))}
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400">
              <th className="px-4 py-2">Invoice</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Due</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No invoices.</td></tr>}
            {rows.map((r) => {
              const balance = Number(r.total) - (paidBy.get(r.id) ?? 0);
              const overdue = r.status !== "paid" && r.status !== "void" && r.dueDate && agingBucket(r.dueDate, now) !== "current";
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2"><Link href={`/accounting/invoices/${r.id}`} className="font-medium text-brand-ink hover:underline">{r.invoiceNumber}</Link></td>
                  <td className="px-4 py-2 text-neutral-800">{r.company ?? "—"}</td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                  <td className={`px-4 py-2 ${overdue ? "font-semibold text-red-600" : "text-neutral-500"}`}>{r.dueDate ? fmtDate(r.dueDate) : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{money(Number(r.total))}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-neutral-900">{r.status === "void" ? "—" : money(balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
