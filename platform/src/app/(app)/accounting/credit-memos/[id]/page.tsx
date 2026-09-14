import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { creditMemos, creditMemoLines, businessPartners, arApplications, invoices } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { creditMemoOpen, openInvoicesFor } from "@/lib/accounting/ar-apply";
import {
  addCreditMemoLineAction,
  removeCreditMemoLineAction,
  updateCreditMemoAction,
  issueCreditMemoAction,
  applyCreditMemoAction,
  voidCreditMemoAction,
} from "@/lib/accounting/ar-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d, yyyy") : "—");
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand";

export default async function CreditMemoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { id } = await params;

  const memo = await db.query.creditMemos.findFirst({ where: eq(creditMemos.id, id) });
  if (!memo) notFound();

  const [lines, bp, unapplied, applications] = await Promise.all([
    db.select().from(creditMemoLines).where(eq(creditMemoLines.memoId, id)).orderBy(asc(creditMemoLines.sortOrder)),
    memo.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, memo.bpId), columns: { id: true, companyName: true } }) : null,
    creditMemoOpen(id),
    db
      .select({ amount: arApplications.amount, invoiceId: arApplications.invoiceId, invoiceNumber: invoices.invoiceNumber })
      .from(arApplications)
      .leftJoin(invoices, eq(invoices.id, arApplications.invoiceId))
      .where(eq(arApplications.creditMemoId, id)),
  ]);

  const open = memo.bpId && memo.status === "open" ? await openInvoicesFor(memo.bpId) : [];
  const appliedByInvoice = new Map(applications.map((a) => [a.invoiceId, Number(a.amount)]));
  const isDraft = memo.status === "draft";
  const isVoid = memo.status === "void";

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm">
        <Link href="/accounting/credit-memos" className="text-neutral-500 hover:text-neutral-900">← Credit memos</Link>
      </div>
      <PageHeader
        title={memo.memoNumber}
        description={`${bp?.companyName ?? "—"}${memo.reason ? ` · ${memo.reason}` : ""} · ${memo.status}${memo.issueDate ? ` · issued ${fmt(memo.issueDate)}` : ""}`}
      />

      {isVoid && (
        <div className="rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm text-neutral-600">
          Voided{memo.voidReason ? ` — ${memo.voidReason}` : ""}. The GL posting has been reversed.
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Lines</h2>
          <div className="text-sm text-neutral-600">
            Subtotal {money(Number(memo.subtotal))} · Tax {money(Number(memo.tax))} ·{" "}
            <strong className="text-neutral-900">Total {money(Number(memo.total))}</strong>
          </div>
        </div>

        {lines.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">No lines yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Unit</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                {editable && isDraft && <th className="py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-3 text-neutral-900">{l.description}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{l.qty}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{money(Number(l.unitPrice))}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium text-neutral-900">{money(Number(l.extended))}</td>
                  {editable && isDraft && (
                    <td className="py-2 text-right">
                      <form action={removeCreditMemoLineAction}>
                        <input type="hidden" name="memoId" value={id} />
                        <input type="hidden" name="lineId" value={l.id} />
                        <button className="text-xs text-neutral-400 hover:text-red-600">remove</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {editable && isDraft && (
          <form action={addCreditMemoLineAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="memoId" value={id} />
            <label className="min-w-[16rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Description</span>
              <input name="description" className={`w-full ${inp}`} placeholder="e.g. 12 tees short shipped" required />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Qty</span>
              <input name="qty" type="number" min="1" defaultValue="1" className={`w-20 ${inp}`} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Unit price</span>
              <input name="unitPrice" inputMode="decimal" defaultValue="0.00" className={`w-28 ${inp}`} />
            </label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add line</button>
          </form>
        )}
      </Card>

      {editable && isDraft && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Details</h2>
          <form action={updateCreditMemoAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="memoId" value={id} />
            <label className="min-w-[14rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Reason</span>
              <input name="reason" defaultValue={memo.reason ?? ""} className={`w-full ${inp}`} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-neutral-600">Tax %</span>
              <input name="taxRate" inputMode="decimal" defaultValue={(Number(memo.taxRate) * 100).toFixed(2)} className={`w-24 ${inp}`} />
            </label>
            <label className="min-w-[14rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Notes</span>
              <input name="notes" defaultValue={memo.notes ?? ""} className={`w-full ${inp}`} />
            </label>
            <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-400">Save</button>
          </form>

          <form action={issueCreditMemoAction} className="mt-4 border-t border-neutral-200 pt-4">
            <input type="hidden" name="memoId" value={id} />
            <button
              disabled={Number(memo.total) <= 0}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              Issue credit memo
            </button>
            <span className="ml-3 text-xs text-neutral-500">Posts Dr Sales / Cr Accounts Receivable and makes the credit available to apply.</span>
          </form>
        </Card>
      )}

      {memo.status === "open" && (
        <Card>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900">Apply to invoices</h2>
            <span className="text-sm text-neutral-600">Unapplied <strong className="text-neutral-900">{money(unapplied)}</strong></span>
          </div>
          {open.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-500">
              No open invoices for this customer — the credit stays on the account.
            </p>
          ) : (
            <form action={applyCreditMemoAction}>
              <input type="hidden" name="memoId" value={id} />
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Invoice</th>
                    <th className="py-2 pr-3">Due</th>
                    <th className="py-2 pr-3 text-right">Open</th>
                    <th className="py-2 text-right">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {open.map((inv) => (
                    <tr key={inv.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-3 font-mono text-xs text-neutral-700">{inv.invoiceNumber}</td>
                      <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(inv.dueDate)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-neutral-900">
                        {money(inv.balance + (appliedByInvoice.get(inv.id) ?? 0))}
                      </td>
                      <td className="py-2 text-right">
                        <input
                          name={`apply[${inv.id}]`}
                          defaultValue={(appliedByInvoice.get(inv.id) ?? "") === "" ? "" : Number(appliedByInvoice.get(inv.id)).toFixed(2)}
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

      {editable && !isVoid && !isDraft && (
        <Card>
          <form action={voidCreditMemoAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="memoId" value={id} />
            <label className="min-w-[14rem] flex-1">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Void reason</span>
              <input name="reason" className={`w-full ${inp}`} placeholder="Why is this being voided?" />
            </label>
            <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-red-300 hover:text-red-600">
              Void memo
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}
