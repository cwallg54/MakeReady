import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { glAccounts } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { accountLedger } from "@/lib/accounting/journal";
import { ACCOUNT_TYPE_MAP } from "@/lib/accounting/gl";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => (n ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  await requireModule("accounting");
  const { account } = await searchParams;

  const accounts = await db.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name }).from(glAccounts).orderBy(asc(glAccounts.code));
  const ledger = account ? await accountLedger(account) : null;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link> · <Link href="/accounting/trial-balance" className="text-neutral-500 hover:text-neutral-900">Trial balance</Link></div>
      <PageHeader title="General ledger" description="Posted transactions for a single account, oldest first, with a running balance." />

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[14rem]"><span className="mb-1 block text-xs font-medium text-neutral-600">Account</span>
            <select name="account" defaultValue={account ?? ""} className={`w-full ${inp}`}>
              <option value="">— choose an account —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">View</button>
        </form>
      </Card>

      {ledger?.account && (
        <Card className="p-0">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-900"><span className="font-mono text-neutral-500">{ledger.account.code}</span> {ledger.account.name}</h2>
            <p className="text-xs text-neutral-400">{ACCOUNT_TYPE_MAP[ledger.account.type].label} · {ACCOUNT_TYPE_MAP[ledger.account.type].normal}-normal</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
              <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Entry</th><th className="px-4 py-2">Memo</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2 text-right">Balance</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {ledger.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">No posted activity for this account.</td></tr>}
              {ledger.rows.map((r, i) => (
                <tr key={i} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 text-neutral-500">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2"><Link href={`/accounting/journal/${r.entryId}`} className="font-mono text-neutral-700 hover:underline">{r.entryNumber}</Link></td>
                  <td className="px-4 py-2 text-neutral-500">{r.memo || "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{money(r.debit)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{money(r.credit)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-neutral-900">{r.running.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
