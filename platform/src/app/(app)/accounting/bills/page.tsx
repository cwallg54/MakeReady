import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bills, vendors, billPayments } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BADGE: Record<string, string> = { draft: "bg-neutral-200 text-neutral-600", open: "bg-amber-100 text-amber-700", partial: "bg-blue-100 text-blue-700", paid: "bg-emerald-100 text-emerald-700", void: "bg-neutral-200 text-neutral-400" };

export default async function BillsPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");

  const rows = await db
    .select({
      id: bills.id, billNumber: bills.billNumber, status: bills.status, dueDate: bills.dueDate, total: bills.total,
      vendorRef: bills.vendorRef, vendor: vendors.name,
      paid: sql<string>`COALESCE((select sum(${billPayments.amount}) from ${billPayments} where ${billPayments.billId} = ${bills.id}),0)`,
    })
    .from(bills).leftJoin(vendors, eq(vendors.id, bills.vendorId))
    .orderBy(desc(bills.createdAt)).limit(200);

  const outstanding = rows.filter((r) => r.status === "open" || r.status === "partial").reduce((s, r) => s + (Number(r.total) - Number(r.paid)), 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link> · <Link href="/accounting/vendors" className="text-neutral-500 hover:text-neutral-900">Vendors</Link></div>
      <PageHeader
        title="Bills (Accounts Payable)"
        description={`What you owe vendors. Outstanding: ${money(outstanding)}.`}
        action={editable ? <Link href="/accounting/bills/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">+ New bill</Link> : undefined}
      />

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-4 py-2">Bill</th><th className="px-4 py-2">Vendor</th><th className="px-4 py-2">Due</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Balance</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">No bills yet.</td></tr>}
            {rows.map((r) => {
              const bal = Number(r.total) - Number(r.paid);
              return (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2"><Link href={`/accounting/bills/${r.id}`} className="font-mono font-medium text-neutral-900 hover:underline">{r.billNumber}</Link>{r.vendorRef && <span className="ml-2 text-xs text-neutral-400">{r.vendorRef}</span>}</td>
                  <td className="px-4 py-2 text-neutral-700">{r.vendor ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{r.dueDate ? fmtDate(r.dueDate) : "—"}</td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${BADGE[r.status] ?? ""}`}>{r.status}</span></td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{money(Number(r.total))}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-neutral-900">{r.status === "void" ? "—" : money(bal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
