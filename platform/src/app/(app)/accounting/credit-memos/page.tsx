import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { creditMemos, businessPartners } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { BpSearchSelect } from "@/components/crm/bp-search-select";
import { createCreditMemoAction } from "@/lib/accounting/ar-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy") : "—");
const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

const STATUS_STYLE: Record<string, string> = {
  draft: "border-neutral-200 bg-neutral-100 text-neutral-600",
  open: "border-amber-200 bg-amber-50 text-amber-700",
  applied: "border-emerald-200 bg-emerald-50 text-emerald-700",
  void: "border-neutral-200 bg-neutral-100 text-neutral-400",
};

export default async function CreditMemosPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");

  const rows = await db
    .select({
      id: creditMemos.id,
      memoNumber: creditMemos.memoNumber,
      status: creditMemos.status,
      issueDate: creditMemos.issueDate,
      reason: creditMemos.reason,
      total: creditMemos.total,
      customer: businessPartners.companyName,
      applied: sql<string>`COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.credit_memo_id = "credit_memos"."id"), 0)`,
    })
    .from(creditMemos)
    .leftJoin(businessPartners, eq(businessPartners.id, creditMemos.bpId))
    .orderBy(desc(creditMemos.createdAt))
    .limit(200);

  const list = rows.map((r) => ({ ...r, total: Number(r.total), applied: Number(r.applied) }));
  const open = list.filter((r) => r.status === "open");
  const openValue = open.reduce((s, r) => s + (r.total - r.applied), 0);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Credit memos"
        description="Credits raised against a customer — returns, shortages, damage and allowances. A credit sits open until it is applied to invoices, exactly like a receipt."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open credits" value={money(openValue)} />
        <StatCard label="Awaiting application" value={String(open.length)} />
        <StatCard label="Raised (last 200)" value={String(list.length)} />
      </div>

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Raise a credit memo</h2>
          <form action={createCreditMemoAction} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Customer</span>
              <BpSearchSelect name="bpId" />
            </div>
            <label className="min-w-[14rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Reason</span>
              <input name="reason" className={inp} placeholder="e.g. Short shipment on SO-1042" />
            </label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create draft</button>
          </form>
        </Card>
      )}

      <Card>
        {list.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No credit memos yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Memo</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Reason</th>
                  <th className="py-2 pr-3">Issued</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Unapplied</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      <Link href={`/accounting/credit-memos/${r.id}`} className="font-mono text-xs text-neutral-700 hover:text-brand">{r.memoNumber}</Link>
                    </td>
                    <td className="py-2 pr-3 text-neutral-900">{r.customer ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{r.reason ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(r.issueDate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-900">{money(r.total)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{money(r.total - r.applied)}</td>
                    <td className="py-2">
                      <span className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
