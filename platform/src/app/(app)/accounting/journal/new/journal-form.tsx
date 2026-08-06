"use client";

import { useState } from "react";
import { createJournalAction } from "@/lib/accounting/gl-journal-actions";

export interface AcctOption { id: string; code: string; name: string; type: string }

const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Row { accountId: string; debit: string; credit: string; memo: string }
const blank = (): Row => ({ accountId: "", debit: "", credit: "", memo: "" });

export function JournalForm({ accounts, today }: { accounts: AcctOption[]; today: string }) {
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);

  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blank()]);
  const removeRow = (i: number) => setRows((rs) => (rs.length > 2 ? rs.filter((_, j) => j !== i) : rs));

  const debitTotal = rows.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const creditTotal = rows.reduce((s, r) => s + (Number(r.credit) || 0), 0);
  const diff = Math.round((debitTotal - creditTotal) * 100) / 100;
  const balanced = diff === 0 && debitTotal > 0;

  return (
    <form action={createJournalAction} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="mb-1 block text-xs font-medium text-neutral-600">Date</span><input name="date" type="date" defaultValue={today} className={inp} /></label>
        <label><span className="mb-1 block text-xs font-medium text-neutral-600">Memo</span><input name="memo" placeholder="Description of this entry" className={inp} /></label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Line memo</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5">
                  <select name="accountId" value={r.accountId} onChange={(e) => set(i, { accountId: e.target.value })} className={inp}>
                    <option value="">— choose account —</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5"><input name="lineMemo" value={r.memo} onChange={(e) => set(i, { memo: e.target.value })} className={inp} /></td>
                <td className="px-3 py-1.5"><input name="debit" type="number" step="0.01" min="0" value={r.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : r.credit })} className={`${inp} text-right`} /></td>
                <td className="px-3 py-1.5"><input name="credit" type="number" step="0.01" min="0" value={r.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : r.debit })} className={`${inp} text-right`} /></td>
                <td className="px-2 text-center">{rows.length > 2 && <button type="button" onClick={() => removeRow(i)} className="text-neutral-400 hover:text-red-600" title="Remove line">✕</button>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
              <td className="px-3 py-2 text-xs text-neutral-500" colSpan={2}>Totals</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(debitTotal)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{money(creditTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRow} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">+ Add line</button>
        <span className={`text-sm font-medium ${balanced ? "text-emerald-600" : "text-amber-600"}`}>
          {balanced ? "✓ Balanced" : diff === 0 ? "Enter debits and credits" : `Out of balance by ${money(Math.abs(diff))}`}
        </span>
        <div className="ml-auto flex gap-2">
          <button name="intent" value="draft" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Save draft</button>
          <button name="intent" value="post" disabled={!balanced} className={`rounded-md px-4 py-2 text-sm font-semibold ${balanced ? "bg-neutral-900 text-white hover:bg-neutral-700" : "cursor-not-allowed bg-neutral-100 text-neutral-400"}`}>Save &amp; post</button>
        </div>
      </div>
    </form>
  );
}
