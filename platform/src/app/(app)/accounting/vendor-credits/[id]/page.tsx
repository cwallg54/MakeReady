import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { vendorCredits, vendorCreditApplications, vendors, bills } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { openBillsFor, vendorCreditOpen } from "@/lib/accounting/payment-runs";
import { applyVendorCreditAction, issueVendorCreditAction } from "@/lib/accounting/ap-run-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy") : "—");

export default async function VendorCreditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { id } = await params;

  const credit = await db.query.vendorCredits.findFirst({ where: eq(vendorCredits.id, id) });
  if (!credit) notFound();

  const [vendor, unapplied, applications] = await Promise.all([
    credit.vendorId ? db.query.vendors.findFirst({ where: eq(vendors.id, credit.vendorId), columns: { id: true, name: true } }) : null,
    vendorCreditOpen(id),
    db
      .select({ amount: vendorCreditApplications.amount, billId: vendorCreditApplications.billId, billNumber: bills.billNumber })
      .from(vendorCreditApplications)
      .leftJoin(bills, eq(bills.id, vendorCreditApplications.billId))
      .where(eq(vendorCreditApplications.creditId, id)),
  ]);

  const open = credit.vendorId && credit.status === "open" ? await openBillsFor(credit.vendorId) : [];
  const appliedByBill = new Map(applications.map((a) => [a.billId, Number(a.amount)]));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="text-sm">
        <Link href="/accounting/vendor-credits" className="text-neutral-500 hover:text-neutral-900">← Vendor credits</Link>
      </div>
      <PageHeader
        title={credit.creditNumber}
        description={`${vendor?.name ?? "—"}${credit.vendorRef ? ` · their ref ${credit.vendorRef}` : ""} · ${money(Number(credit.total))} · ${credit.status}`}
      />

      {credit.reason && (
        <Card>
          <div className="text-xs text-neutral-500">Reason</div>
          <div className="text-sm text-neutral-900">{credit.reason}</div>
          {credit.issueDate && <div className="mt-1 text-xs text-neutral-500">Issued {fmt(credit.issueDate)}</div>}
        </Card>
      )}

      {editable && credit.status === "draft" && (
        <Card>
          <form action={issueVendorCreditAction}>
            <input type="hidden" name="creditId" value={id} />
            <button
              disabled={Number(credit.total) <= 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Issue credit
            </button>
            <span className="ml-3 text-xs text-neutral-500">Makes it available to apply against this vendor&apos;s open bills.</span>
          </form>
        </Card>
      )}

      {credit.status === "open" && (
        <Card>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">Apply to bills</h2>
            <span className="text-sm text-neutral-600">Unapplied <strong className="text-neutral-900">{money(unapplied)}</strong></span>
          </div>
          {open.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">
              This vendor has no open bills — the credit waits for the next one.
            </p>
          ) : (
            <form action={applyVendorCreditAction}>
              <input type="hidden" name="creditId" value={id} />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Bill</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3 text-right">Open</th>
                    <th className="py-2 text-right">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((b) => (
                    <tr key={b.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-3 font-mono text-xs text-neutral-700">{b.billNumber}</td>
                      <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(b.dueDate)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-neutral-900">
                        {money(b.balance + (appliedByBill.get(b.id) ?? 0))}
                      </td>
                      <td className="py-2 text-right">
                        <input
                          name={`apply[${b.id}]`}
                          defaultValue={appliedByBill.get(b.id) ? Number(appliedByBill.get(b.id)).toFixed(2) : ""}
                          inputMode="decimal"
                          disabled={!editable}
                          className="w-28 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm outline-none focus:border-brand disabled:bg-neutral-100"
                          placeholder="0.00"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {editable && (
                <button className="mt-3 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save application</button>
              )}
            </form>
          )}
        </Card>
      )}

      {applications.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Applied against</h2>
          <ul className="space-y-1 text-sm">
            {applications.map((a, i) => (
              <li key={i} className="flex justify-between">
                <span className="font-mono text-xs text-neutral-600">{a.billNumber ?? "—"}</span>
                <span className="tabular-nums text-neutral-900">{money(Number(a.amount))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
