import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { recurringJournals, recurringJournalLines, glAccounts } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { updateRecurringMetaAction, addRecurringLineAction, removeRecurringLineAction, deleteRecurringAction, postRecurringNowAction } from "@/lib/accounting/recurring-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function RecurringDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { id } = await params;
  const t = await db.query.recurringJournals.findFirst({ where: eq(recurringJournals.id, id) });
  if (!t) notFound();
  const [lines, accounts] = await Promise.all([
    db.select({ id: recurringJournalLines.id, accountId: recurringJournalLines.accountId, debit: recurringJournalLines.debit, credit: recurringJournalLines.credit, memo: recurringJournalLines.memo, code: glAccounts.code, name: glAccounts.name })
      .from(recurringJournalLines).innerJoin(glAccounts, eq(glAccounts.id, recurringJournalLines.accountId)).where(eq(recurringJournalLines.templateId, id)).orderBy(asc(recurringJournalLines.sortOrder)),
    db.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name }).from(glAccounts).where(eq(glAccounts.active, true)).orderBy(asc(glAccounts.code)),
  ]);
  const totalDr = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCr = lines.reduce((s, l) => s + Number(l.credit), 0);
  const balanced = Math.abs(totalDr - totalCr) < 0.005 && totalDr > 0;
  const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const postedThisMonth = t.lastPostedYm === ym;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/accounting/recurring" className="text-sm text-neutral-500 hover:text-neutral-900">← Recurring entries</Link>
      <PageHeader title={t.name} description={`Auto-posts on day ${t.dayOfMonth} each month${t.lastPostedYm ? ` · last posted ${t.lastPostedYm}` : ""}`} />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Template</h2>
        {editable ? (
          <form action={updateRecurringMetaAction} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="id" value={t.id} />
            <label className="sm:col-span-2 text-xs text-neutral-500">Name<input name="name" defaultValue={t.name} className={`mt-1 w-full ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Post on day<input name="dayOfMonth" type="number" min={1} max={28} defaultValue={t.dayOfMonth} className={`mt-1 w-full ${inp}`} /></label>
            <label className="flex items-end gap-2 text-sm text-neutral-700"><input type="checkbox" name="active" defaultChecked={t.active} className="h-4 w-4" /> Active</label>
            <label className="sm:col-span-4 text-xs text-neutral-500">Memo<input name="memo" defaultValue={t.memo ?? ""} className={`mt-1 w-full ${inp}`} /></label>
            <div className="sm:col-span-4"><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Save</button></div>
          </form>
        ) : (
          <p className="text-sm text-neutral-600">Day {t.dayOfMonth} · {t.active ? "active" : "paused"}{t.memo ? ` · ${t.memo}` : ""}</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Lines</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-neutral-400"><tr><th className="py-1">Account</th><th>Memo</th><th className="text-right">Debit</th><th className="text-right">Credit</th>{editable && <th></th>}</tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={editable ? 5 : 4} className="py-3 text-center text-neutral-400">No lines yet.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1 pr-2 text-neutral-800">{l.code} · {l.name}</td>
                <td className="py-1 pr-2 text-neutral-500">{l.memo ?? "—"}</td>
                <td className="py-1 pr-2 text-right">{Number(l.debit) > 0 ? money(Number(l.debit)) : "—"}</td>
                <td className="py-1 pr-2 text-right">{Number(l.credit) > 0 ? money(Number(l.credit)) : "—"}</td>
                {editable && <td className="py-1 text-right"><form action={removeRecurringLineAction} className="inline"><input type="hidden" name="templateId" value={t.id} /><input type="hidden" name="lineId" value={l.id} /><button className="text-neutral-400 hover:text-red-600">×</button></form></td>}
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-neutral-200 text-xs font-semibold"><td className="py-1" colSpan={2}>Totals</td><td className="py-1 text-right">{money(totalDr)}</td><td className="py-1 text-right">{money(totalCr)}</td>{editable && <td></td>}</tr></tfoot>
        </table>
        {!balanced && lines.length > 0 && <p className="mt-2 text-xs text-amber-600">Debits must equal credits before this can post (currently {money(totalDr)} vs {money(totalCr)}).</p>}
        {editable && (
          <form action={addRecurringLineAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <input type="hidden" name="templateId" value={t.id} />
            <label className="text-xs text-neutral-500">Account
              <select name="accountId" className={`mt-1 w-64 ${inp}`}><option value="">— account —</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
            </label>
            <label className="text-xs text-neutral-500">Debit<input name="debit" type="number" step="0.01" className={`mt-1 w-24 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Credit<input name="credit" type="number" step="0.01" className={`mt-1 w-24 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Memo<input name="memo" className={`mt-1 w-40 ${inp}`} /></label>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add line</button>
          </form>
        )}
      </Card>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          {balanced && !postedThisMonth && (
            <form action={postRecurringNowAction}><input type="hidden" name="id" value={t.id} /><button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Post this month now →</button></form>
          )}
          {postedThisMonth && <span className="text-sm text-emerald-700">Already posted for {ym}.</span>}
          <form action={deleteRecurringAction} className="ml-auto"><input type="hidden" name="id" value={t.id} /><ConfirmButton message="Delete this recurring entry?" className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50">Delete</ConfirmButton></form>
        </div>
      )}
    </div>
  );
}
