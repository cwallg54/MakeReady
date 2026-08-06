import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { glAccounts } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ACCOUNT_TYPES } from "@/lib/accounting/gl";
import { createGlAccountAction, updateGlAccountAction, toggleGlAccountAction } from "@/lib/accounting/gl-account-actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function ChartOfAccountsPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { err } = await searchParams;

  const accounts = await db.select().from(glAccounts).orderBy(asc(glAccounts.code));
  const byType = new Map(ACCOUNT_TYPES.map((t) => [t.key, accounts.filter((a) => a.type === t.key)]));

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader title="Chart of Accounts" description="The general-ledger account structure. Journal entries post to these accounts; the trial balance and financial statements roll up from them." />

      {err === "dupe" && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">An account with that code already exists.</div>}
      {err === "fields" && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">Code, name, and a valid type are required.</div>}

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Add an account</h2>
          <form action={createGlAccountAction} className="grid gap-2 sm:grid-cols-6">
            <label className="sm:col-span-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Code</span><input name="code" required placeholder="1000" className={`w-full font-mono ${inp}`} /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Name</span><input name="name" required placeholder="Cash — Operating" className={`w-full ${inp}`} /></label>
            <label className="sm:col-span-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Type</span>
              <select name="type" defaultValue="asset" className={`w-full ${inp}`}>{ACCOUNT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            </label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Subtype <span className="text-neutral-400">optional</span></span><input name="subtype" placeholder="Current Asset" className={`w-full ${inp}`} /></label>
            <div className="sm:col-span-6"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add account</button></div>
          </form>
        </Card>
      )}

      {ACCOUNT_TYPES.map((t) => {
        const list = byType.get(t.key) ?? [];
        return (
          <Card key={t.key} className="p-0">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-neutral-900">{t.plural}</h2>
              <span className="text-xs text-neutral-400">{t.normal}-normal · {list.length} account{list.length === 1 ? "" : "s"}</span>
            </div>
            {list.length === 0 ? (
              <p className="px-5 py-4 text-sm text-neutral-400">No {t.label.toLowerCase()} accounts yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {list.map((a) => (
                  <li key={a.id} className="px-5 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-mono text-sm text-neutral-500">{a.code}</span>
                        <span className={`ml-3 text-sm ${a.active ? "font-medium text-neutral-900" : "text-neutral-400 line-through"}`}>{a.name}</span>
                        {a.subtype && <span className="ml-2 text-xs text-neutral-400">{a.subtype}</span>}
                        {a.systemKey && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">system</span>}
                      </div>
                      {editable && (
                        <div className="flex shrink-0 items-center gap-3">
                          <form action={toggleGlAccountAction}><input type="hidden" name="id" value={a.id} /><button className="text-xs font-medium text-neutral-500 hover:text-neutral-800">{a.active ? "Disable" : "Enable"}</button></form>
                        </div>
                      )}
                    </div>
                    {editable && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-600">Edit</summary>
                        <form action={updateGlAccountAction} className="mt-2 grid gap-2 sm:grid-cols-6">
                          <input type="hidden" name="id" value={a.id} />
                          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Name</span><input name="name" defaultValue={a.name} className={`w-full ${inp}`} /></label>
                          <label className="sm:col-span-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Type</span>
                            <select name="type" defaultValue={a.type} className={`w-full ${inp}`}>{ACCOUNT_TYPES.map((tt) => <option key={tt.key} value={tt.key}>{tt.label}</option>)}</select>
                          </label>
                          <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Subtype</span><input name="subtype" defaultValue={a.subtype ?? ""} className={`w-full ${inp}`} /></label>
                          <div className="sm:col-span-6"><button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">Save</button></div>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
