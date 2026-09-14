import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { vendorCredits, vendors } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { createVendorCreditAction } from "@/lib/accounting/ap-run-actions";

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

export default async function VendorCreditsPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");

  const [rows, vendorList] = await Promise.all([
    db
      .select({
        id: vendorCredits.id,
        creditNumber: vendorCredits.creditNumber,
        vendorRef: vendorCredits.vendorRef,
        status: vendorCredits.status,
        issueDate: vendorCredits.issueDate,
        reason: vendorCredits.reason,
        total: vendorCredits.total,
        vendor: vendors.name,
        applied: sql<string>`COALESCE((SELECT SUM(a.amount) FROM vendor_credit_applications a WHERE a.credit_id = "vendor_credits"."id"), 0)`,
      })
      .from(vendorCredits)
      .leftJoin(vendors, eq(vendors.id, vendorCredits.vendorId))
      .orderBy(desc(vendorCredits.createdAt))
      .limit(200),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(eq(vendors.active, true)).orderBy(vendors.name).limit(500),
  ]);

  const list = rows.map((r) => ({ ...r, total: Number(r.total), applied: Number(r.applied) }));
  const open = list.filter((r) => r.status === "open");
  const openValue = open.reduce((s, r) => s + (r.total - r.applied), 0);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Vendor credits"
        description="Credits owed back by a supplier — returns, shortages, rebates. Applied against their open bills so the next payment run is net of them."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open credits" value={money(openValue)} />
        <StatCard label="Awaiting application" value={String(open.length)} />
        <StatCard label="Raised (last 200)" value={String(list.length)} />
      </div>

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Record a vendor credit</h2>
          <form action={createVendorCreditAction} className="flex flex-wrap items-end gap-3">
            <label className="min-w-[14rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Vendor</span>
              <select name="vendorId" className={inp} required>
                <option value="">Choose…</option>
                {vendorList.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Their credit no.</span>
              <input name="vendorRef" className={`w-36 ${inp}`} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Amount</span>
              <input name="total" inputMode="decimal" className={`w-32 ${inp}`} placeholder="0.00" required />
            </label>
            <label className="min-w-[12rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Reason</span>
              <input name="reason" className={inp} placeholder="e.g. 3 boxes returned damaged" />
            </label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create</button>
          </form>
        </Card>
      )}

      <Card>
        {list.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">No vendor credits yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Credit</th>
                  <th className="py-2 pr-3">Vendor</th>
                  <th className="py-2 pr-3">Their ref</th>
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
                      <Link href={`/accounting/vendor-credits/${r.id}`} className="font-mono text-xs text-neutral-700 hover:text-brand">{r.creditNumber}</Link>
                    </td>
                    <td className="py-2 pr-3 text-neutral-900">{r.vendor ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{r.vendorRef ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{r.reason ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(r.issueDate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-900">{money(r.total)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{money(r.total - r.applied)}</td>
                    <td className="py-2"><span className={`rounded border px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span></td>
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
