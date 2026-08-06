import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { bankTransactions, glAccounts, journalLines, journalEntries } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { importBankTxnsAction, toggleClearedAction, deleteBankTxnAction, postBankTxnAction } from "@/lib/accounting/bank-actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ReconcilePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; stmt?: string }> }) {
  const user = await requireModule("accounting");
  if (!canEdit(user.roles, "accounting")) redirect("/accounting");
  const { ok, err, stmt } = await searchParams;

  const [txns, accounts, cashRow] = await Promise.all([
    db.select().from(bankTransactions).orderBy(asc(bankTransactions.txnDate)),
    db.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name }).from(glAccounts).where(eq(glAccounts.active, true)).orderBy(asc(glAccounts.code)),
    db.select({ b: sql<string>`COALESCE(SUM(${journalLines.debit} - ${journalLines.credit}),0)` })
      .from(journalLines).innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId)).innerJoin(glAccounts, eq(glAccounts.id, journalLines.accountId))
      .where(and(eq(glAccounts.systemKey, "cash"), eq(journalEntries.status, "posted"))),
  ]);
  const bookBalance = Number(cashRow[0]?.b ?? 0);
  const clearedTotal = txns.filter((t) => t.cleared).reduce((s, t) => s + Number(t.amount), 0);
  const uncleared = txns.filter((t) => !t.cleared);
  const statementBal = stmt ? Number(stmt) : null;
  const difference = statementBal != null ? Math.round((bookBalance - statementBal) * 100) / 100 : null;
  const reconciled = difference === 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link></div>
      <PageHeader title="Bank reconciliation" description="Import a bank statement, tick off cleared items, and post anything the bank has that the books don't." />

      {ok && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{ok}</div>}
      {err && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">{err}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Book cash balance" value={money(bookBalance)} hint="GL cash account" />
        <StatCard label="Cleared this session" value={money(clearedTotal)} hint={`${txns.length - uncleared.length}/${txns.length} lines`} />
        <StatCard label="Statement balance" value={statementBal != null ? money(statementBal) : "—"} hint="Enter below" />
        <StatCard label="Difference" value={difference != null ? money(difference) : "—"} hint={difference != null ? (reconciled ? "Reconciled ✓" : "Explain w/ outstanding items") : "Book − statement"} />
      </div>

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">Statement ending balance</span><input name="stmt" type="number" step="0.01" defaultValue={stmt ?? ""} placeholder="0.00" className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Update</button>
          <span className="text-xs text-neutral-400">When the difference is explained by outstanding checks / deposits in transit, you&apos;re reconciled.</span>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Import bank statement</h2>
        <p className="mb-3 text-xs text-neutral-500">Paste rows as <span className="font-mono">date, description, amount</span> — deposits positive, withdrawals negative (or in parentheses).</p>
        <form action={importBankTxnsAction} className="space-y-2">
          <textarea name="csv" rows={5} placeholder={"2026-08-01, Customer deposit, 4200.00\n2026-08-03, Bank service fee, -35.00\n2026-08-05, Check 1042, (1,250.00)"} className={`w-full font-mono ${inp}`} />
          <button className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Import lines</button>
        </form>
      </Card>

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-5 py-3"><h2 className="text-sm font-semibold text-neutral-900">Bank lines ({txns.length})</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-center">Cleared</th><th className="px-4 py-2">Post to GL</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {txns.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No bank lines imported yet.</td></tr>}
            {txns.map((t) => {
              const amt = Number(t.amount);
              return (
                <tr key={t.id} className={t.cleared ? "bg-emerald-50/40" : ""}>
                  <td className="px-4 py-2 text-neutral-500">{fmtDate(t.txnDate)}</td>
                  <td className="px-4 py-2 text-neutral-800">{t.description}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${amt < 0 ? "text-red-600" : "text-neutral-900"}`}>{money(amt)}</td>
                  <td className="px-4 py-2 text-center">
                    <form action={toggleClearedAction}><input type="hidden" name="id" value={t.id} /><button className={`rounded-md border px-2 py-1 text-xs font-medium ${t.cleared ? "border-emerald-300 bg-emerald-100 text-emerald-700" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50"}`}>{t.cleared ? "✓ Cleared" : "Clear"}</button></form>
                  </td>
                  <td className="px-4 py-2">
                    {t.journalEntryId ? (
                      <Link href={`/accounting/journal/${t.journalEntryId}`} className="text-xs font-medium text-brand-ink hover:underline">posted →</Link>
                    ) : (
                      <form action={postBankTxnAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={t.id} />
                        <select name="accountId" required defaultValue="" className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs outline-none focus:border-brand">
                          <option value="" disabled>account…</option>
                          {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                        </select>
                        <button className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Post</button>
                      </form>
                    )}
                  </td>
                  <td className="px-2 text-right"><form action={deleteBankTxnAction}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-red-600 hover:text-red-800">✕</button></form></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
