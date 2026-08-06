import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { db } from "@/db";
import { bills, billLines, billPayments, vendors, glAccounts } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDate } from "@/lib/format";
import { updateBillMetaAction, addBillLineAction, removeBillLineAction, approveBillAction, recordBillPaymentAction, voidBillAction } from "@/lib/accounting/ap-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const BADGE: Record<string, string> = { draft: "bg-neutral-200 text-neutral-600", open: "bg-amber-100 text-amber-700", partial: "bg-blue-100 text-blue-700", paid: "bg-emerald-100 text-emerald-700", void: "bg-neutral-200 text-neutral-400" };

export default async function BillDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { id } = await params;
  const { err } = await searchParams;

  const bill = await db.query.bills.findFirst({ where: eq(bills.id, id) });
  if (!bill) notFound();
  const draft = bill.status === "draft";
  const voided = !!bill.voidedAt;

  const [lines, pays, vs, accounts, vendor] = await Promise.all([
    db.select({ id: billLines.id, description: billLines.description, qty: billLines.qty, unitPrice: billLines.unitPrice, extended: billLines.extended, code: glAccounts.code, acct: glAccounts.name })
      .from(billLines).leftJoin(glAccounts, eq(glAccounts.id, billLines.accountId)).where(eq(billLines.billId, id)).orderBy(asc(billLines.sortOrder)),
    db.select().from(billPayments).where(eq(billPayments.billId, id)).orderBy(asc(billPayments.paidDate)),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(asc(vendors.name)),
    db.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name }).from(glAccounts).where(eq(glAccounts.active, true)).orderBy(asc(glAccounts.code)),
    bill.vendorId ? db.query.vendors.findFirst({ where: eq(vendors.id, bill.vendorId) }) : Promise.resolve(null),
  ]);
  const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
  const balance = Number(bill.total) - paid;
  const due = DateTime.now();

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/accounting/bills" className="text-sm text-neutral-500 hover:text-neutral-900">← Bills</Link>
      <PageHeader
        title={bill.billNumber}
        description={`${vendor?.name ?? "No vendor"}${bill.vendorRef ? ` · ${bill.vendorRef}` : ""}`}
        action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${BADGE[bill.status] ?? ""}`}>{bill.status}</span>}
      />

      {err && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">{err}</div>}
      {voided && bill.voidReason && <div className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">Voided: {bill.voidReason}</div>}

      {/* Meta */}
      {editable && !voided && (
        <Card>
          <form action={updateBillMetaAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={bill.id} />
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Vendor</span>
              <select name="vendorId" defaultValue={bill.vendorId ?? ""} className={inp}><option value="">—</option>{vs.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
            </label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Vendor invoice #</span><input name="vendorRef" defaultValue={bill.vendorRef ?? ""} className={inp} /></label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Terms</span><input name="terms" defaultValue={bill.terms ?? ""} placeholder="Net 30" className={inp} /></label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Due date</span><input name="dueDate" type="date" defaultValue={bill.dueDate ? DateTime.fromJSDate(bill.dueDate).toFormat("yyyy-LL-dd") : ""} className={inp} /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Notes</span><input name="notes" defaultValue={bill.notes ?? ""} className={inp} /></label>
            <div className="sm:col-span-2"><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Save</button></div>
          </form>
        </Card>
      )}

      {/* Lines */}
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-4 py-2">Description</th><th className="px-4 py-2">Account</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit</th><th className="px-4 py-2 text-right">Amount</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={6} className="px-4 py-4 text-center text-neutral-400">No lines yet.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 text-neutral-800">{l.description}</td>
                <td className="px-4 py-2 text-neutral-500">{l.code ? `${l.code} · ${l.acct}` : <span className="text-amber-600">— none —</span>}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{Number(l.qty)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-600">{money(Number(l.unitPrice))}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-900">{money(Number(l.extended))}</td>
                <td className="px-2 text-right">{editable && draft && <form action={removeBillLineAction}><input type="hidden" name="billId" value={bill.id} /><input type="hidden" name="lineId" value={l.id} /><button className="text-xs text-red-600 hover:text-red-800">✕</button></form>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold"><td className="px-4 py-2" colSpan={4}>Total</td><td className="px-4 py-2 text-right tabular-nums">{money(Number(bill.total))}</td><td></td></tr>
          </tfoot>
        </table>
        {editable && draft && (
          <form action={addBillLineAction} className="grid gap-2 border-t border-neutral-100 p-3 sm:grid-cols-12">
            <input type="hidden" name="billId" value={bill.id} />
            <input name="description" required placeholder="Description" className={`sm:col-span-4 ${inp}`} />
            <select name="accountId" defaultValue={vendor?.defaultAccountId ?? ""} className={`sm:col-span-4 ${inp}`}>
              <option value="">— account —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
            <input name="qty" type="number" step="0.01" min="0" defaultValue="1" className={`sm:col-span-1 ${inp}`} />
            <input name="unitPrice" type="number" step="0.01" min="0" placeholder="0.00" className={`sm:col-span-2 ${inp}`} />
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 sm:col-span-1">Add</button>
          </form>
        )}
      </Card>

      {/* Actions: approve / pay / void */}
      {editable && !voided && (
        <div className="grid gap-4 sm:grid-cols-2">
          {draft ? (
            <Card>
              <h2 className="mb-1 text-sm font-semibold text-neutral-900">Approve bill</h2>
              <p className="mb-3 text-xs text-neutral-500">Issues the bill and posts it to the ledger (Dr the line accounts, Cr Accounts Payable). Add lines first.</p>
              <form action={approveBillAction}><input type="hidden" name="id" value={bill.id} /><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Approve &amp; post</button></form>
            </Card>
          ) : (
            <Card>
              <h2 className="mb-1 text-sm font-semibold text-neutral-900">Record a payment</h2>
              <p className="mb-3 text-xs text-neutral-500">Balance due {money(balance)}. Posts Dr Accounts Payable / Cr Cash.</p>
              {balance > 0.005 ? (
                <form action={recordBillPaymentAction} className="grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="billId" value={bill.id} />
                  <label><span className="mb-1 block text-xs font-medium text-neutral-600">Amount</span><input name="amount" type="number" step="0.01" min="0" defaultValue={balance.toFixed(2)} className={inp} /></label>
                  <label><span className="mb-1 block text-xs font-medium text-neutral-600">Method</span><select name="method" className={inp}><option value="check">Check</option><option value="ach">ACH</option><option value="card">Card</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
                  <label><span className="mb-1 block text-xs font-medium text-neutral-600">Reference</span><input name="reference" placeholder="Check # / trace" className={inp} /></label>
                  <label><span className="mb-1 block text-xs font-medium text-neutral-600">Paid date</span><input name="paidDate" type="date" defaultValue={due.toFormat("yyyy-LL-dd")} className={inp} /></label>
                  <div className="sm:col-span-2"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Record payment</button></div>
                </form>
              ) : <p className="text-sm text-emerald-700">✓ Paid in full.</p>}
            </Card>
          )}
          <Card className="border-red-200">
            <h2 className="mb-1 text-sm font-semibold text-red-800">Void bill</h2>
            <p className="mb-3 text-xs text-neutral-500">Cancels the bill and reverses its ledger posting. A reason is required.</p>
            <form action={voidBillAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={bill.id} />
              <input name="reason" required placeholder="Why is this being voided?" className={inp} />
              <ConfirmButton message="Void this bill? It reverses the GL posting." className="self-start rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Void bill</ConfirmButton>
            </form>
          </Card>
        </div>
      )}

      {pays.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Payments</h2>
          <ul className="space-y-1 text-sm">
            {pays.map((p) => <li key={p.id} className="flex justify-between"><span className="text-neutral-600">{fmtDate(p.paidDate)} · {p.method}{p.reference ? ` · ${p.reference}` : ""}</span><span className="tabular-nums text-neutral-900">{money(Number(p.amount))}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
