import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getCreditData, getCreditAR } from "@/lib/reports/standard-data";
import { fmtDate } from "@/lib/format";
import { money2, daysUntil, ORDER_TYPE_LABEL } from "@/lib/reports/standard";
import { updateCreditControlsAction } from "@/lib/accounting/actions";
import { isHidden } from "@/lib/reports/report-config";
import { getReportSettings } from "@/lib/reports/settings";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="text-sm text-neutral-900">{value || "—"}</dd>
    </div>
  );
}

export default async function CreditReportPage({ params }: { params: Promise<{ bpId: string }> }) {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const { bpId } = await params;
  const now = new Date();
  const [data, ar] = await Promise.all([getCreditData(bpId, now), getCreditAR(bpId, now)]);
  if (!data) notFound();
  const { bp, contactName, billing, groupName, repName, salesBuckets, openOrders, openOrdersTotal, activity } = data;

  const availableCredit = bp.creditLimit != null ? Number(bp.creditLimit) - ar.totalAR : null;
  const histApa = bp.historicalApa ?? ar.historicalApa;
  const twoApa = bp.twoYearApa ?? ar.twoYearApa;
  const canManage = canEdit(user.roles, "accounting");
  const settings = await getReportSettings("credit");
  const showSec = (k: string) => !isHidden(settings, k);

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/reports/standard/credit" className="text-sm text-neutral-500 hover:text-neutral-900">← Credit reports</Link>
      <PageHeader
        title={bp.companyName}
        description={`${bp.legacyCode ?? bp.bpNumber} · Customer Credit Report`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/reports/config/credit" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Edit</Link>
            <Link href={`/accounting/statements/${bp.id}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Statement →</Link>
            <Link href={`/crm/${bp.id}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Open account →</Link>
          </div>
        }
      />

      {bp.creditHold && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">On credit hold.</span> {bp.creditHoldReason || "No reason recorded."}
        </div>
      )}

      {/* Credit header */}
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label="Terms" value={bp.paymentTerms} />
          <Field label="Credit Limit" value={bp.creditLimit != null ? money2(Number(bp.creditLimit)) : null} />
          <Field label="AR Balance" value={money2(ar.totalAR)} />
          <Field label="Available Credit" value={availableCredit != null ? money2(availableCredit) : null} />
          <Field label="On Credit Hold" value={bp.creditHold ? "Yes" : "No"} />
          <Field label="Personal Guarantee" value={bp.personalGuarantee ? "Yes" : "No"} />
          <Field label="Customer Since" value={bp.customerSince ? fmtDate(bp.customerSince) : null} />
          <Field label="Historical APA" value={histApa != null ? `${histApa} days` : null} />
          <Field label="Two-Year APA" value={twoApa != null ? `${twoApa} days` : null} />
          <Field label="Sales Rep" value={repName} />
          <Field label="Territory" value={bp.territory} />
          <Field label="Account Group" value={groupName} />
          <Field label="Price List" value={bp.priceList} />
          <Field label="Softgood Price Level" value={bp.softgoodPriceLevel} />
          <Field label="Shipping Type" value={bp.shippingType} />
          <Field label="Parent Number" value={bp.parentBpNumber} />
          <Field label="Contact" value={contactName} />
          <Field label="Phone" value={bp.phone} />
        </div>
        <div className="mt-4 border-t border-neutral-100 pt-4 text-sm text-neutral-600">
          {billing ? (
            <span>{[billing.street, billing.city, billing.state, billing.zip].filter(Boolean).join(", ")}</span>
          ) : (
            <span>{[bp.addressStreet, bp.addressCity, bp.addressState, bp.addressZip].filter(Boolean).join(", ") || "No address on file"}</span>
          )}
        </div>
      </Card>

      {/* Credit controls (finance) */}
      {canManage && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Credit controls</h2>
          <form action={updateCreditControlsAction} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="bpId" value={bp.id} />
            <label className="text-xs text-neutral-500">Credit limit $<input name="creditLimit" type="number" step="0.01" min="0" defaultValue={bp.creditLimit ?? ""} className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500" /></label>
            <label className="text-xs text-neutral-500">Terms<input name="paymentTerms" defaultValue={bp.paymentTerms ?? ""} placeholder="Net 30" className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500" /></label>
            <label className="flex items-center gap-2 pt-5 text-sm text-neutral-700"><input type="checkbox" name="creditHold" defaultChecked={bp.creditHold} className="h-4 w-4" /> Credit hold</label>
            <label className="flex items-center gap-2 pt-5 text-sm text-neutral-700"><input type="checkbox" name="personalGuarantee" defaultChecked={bp.personalGuarantee} className="h-4 w-4" /> Personal guarantee</label>
            <label className="text-xs text-neutral-500 sm:col-span-3">Hold reason<input name="creditHoldReason" defaultValue={bp.creditHoldReason ?? ""} className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500" /></label>
            <div className="flex items-end"><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Save</button></div>
          </form>
          <p className="mt-2 text-xs text-neutral-400">A credit hold or exceeding the limit blocks converting quotes to orders for this customer.</p>
        </Card>
      )}

      {/* Trailing sales */}
      {showSec("trailingSales") && (
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Trailing sales</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><div className="text-lg font-semibold text-neutral-900">{money2(salesBuckets[0])}</div><div className="text-xs text-neutral-500">Months 1–12</div></div>
          <div><div className="text-lg font-semibold text-neutral-900">{money2(salesBuckets[1])}</div><div className="text-xs text-neutral-500">Months 13–24</div></div>
          <div><div className="text-lg font-semibold text-neutral-900">{money2(salesBuckets[2])}</div><div className="text-xs text-neutral-500">Months 25–36</div></div>
        </div>
      </Card>
      )}

      {/* Open orders */}
      {showSec("openOrders") && (
      <Card className="overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Open Orders</h2>
          <span className="text-sm font-semibold text-neutral-900 tabular-nums">{money2(openOrdersTotal)}</span>
        </div>
        {openOrders.length === 0 ? (
          <p className="text-sm text-neutral-400">No open orders.</p>
        ) : (
          <table className="w-full min-w-[700px] text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-wide text-neutral-400">
                <th className="px-2 py-1">SO #</th><th className="px-2 py-1">Type</th><th className="px-2 py-1">PO #</th>
                <th className="px-2 py-1">Entered</th><th className="px-2 py-1">Due</th><th className="px-2 py-1 text-right">Age (days)</th>
                <th className="px-2 py-1">Date Type</th><th className="px-2 py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.map((o) => (
                <tr key={o.id} className="border-b border-neutral-50">
                  <td className="px-2 py-1"><Link href={`/sales/orders/${o.id}`} className="font-medium text-blue-600 hover:underline">{o.orderNumber}</Link></td>
                  <td className="px-2 py-1" title={o.orderType ? ORDER_TYPE_LABEL[o.orderType] : ""}>{o.orderType ?? "—"}</td>
                  <td className="px-2 py-1 text-neutral-500">{o.poNumber ?? ""}</td>
                  <td className="px-2 py-1 text-neutral-500">{fmtDate(o.enteredDate)}</td>
                  <td className="px-2 py-1 text-neutral-500">{o.dueDate ? fmtDate(o.dueDate) : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-neutral-500">{daysUntil(now, o.enteredDate)}</td>
                  <td className="px-2 py-1 text-neutral-500">{o.dateType}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-neutral-800">{money2(o.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      )}

      {/* Open invoices + aging */}
      {showSec("openInvoices") && (
      <Card className="overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Open Invoices</h2>
          <span className="text-sm font-semibold text-neutral-900 tabular-nums">{money2(ar.totalAR)}</span>
        </div>
        {ar.openInvoices.length === 0 ? (
          <p className="text-sm text-neutral-400">No open invoices.</p>
        ) : (
          <>
            <table className="w-full min-w-[560px] text-xs">
              <thead><tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-wide text-neutral-400"><th className="px-2 py-1">Invoice</th><th className="px-2 py-1">Issued</th><th className="px-2 py-1">Due</th><th className="px-2 py-1">Aging</th><th className="px-2 py-1 text-right">Total</th><th className="px-2 py-1 text-right">Balance</th></tr></thead>
              <tbody>
                {ar.openInvoices.map((i) => (
                  <tr key={i.id} className="border-b border-neutral-50">
                    <td className="px-2 py-1"><Link href={`/accounting/invoices/${i.id}`} className="font-medium text-blue-600 hover:underline">{i.invoiceNumber}</Link></td>
                    <td className="px-2 py-1 text-neutral-500">{i.issueDate ? fmtDate(i.issueDate) : "—"}</td>
                    <td className="px-2 py-1 text-neutral-500">{i.dueDate ? fmtDate(i.dueDate) : "—"}</td>
                    <td className={`px-2 py-1 ${i.bucket === "90+" ? "font-semibold text-red-600" : "text-neutral-500"}`}>{i.bucket}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-neutral-600">{money2(i.total)}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-medium text-neutral-900">{money2(i.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
              {ar.agingBuckets.map((b) => <span key={b}>{b}: <span className="font-medium text-neutral-800 tabular-nums">{money2(ar.aging[b])}</span></span>)}
            </div>
          </>
        )}
      </Card>
      )}

      {/* Payments */}
      {showSec("payments") && (
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Recent Payments</h2>
        {ar.payments.length === 0 ? (
          <p className="text-sm text-neutral-400">No payments recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {ar.payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span className="text-neutral-600">{fmtDate(p.date)} · <span className="capitalize">{p.method}</span>{p.invoiceNumber ? ` · ${p.invoiceNumber}` : " · on account"}</span>
                <span className="font-medium tabular-nums text-emerald-700">{money2(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      )}

      {/* Collection activity */}
      {showSec("activity") && (
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-neutral-400">No activity logged.</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((a) => (
              <li key={a.id} className="border-l-2 border-neutral-200 pl-3">
                <div className="text-[11px] text-neutral-400">{fmtDate(a.date)} · {a.author}</div>
                <div className="whitespace-pre-wrap text-sm text-neutral-800">{a.content}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      )}
    </div>
  );
}
