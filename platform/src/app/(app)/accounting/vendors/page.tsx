import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { vendors, glAccounts } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { createVendorAction, toggleVendorAction } from "@/lib/accounting/ap-actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function VendorsPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const [rows, accounts] = await Promise.all([
    db.select().from(vendors).orderBy(asc(vendors.name)),
    db.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name }).from(glAccounts).where(eq(glAccounts.active, true)).orderBy(asc(glAccounts.code)),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link> · <Link href="/accounting/bills" className="text-neutral-500 hover:text-neutral-900">Bills</Link></div>
      <PageHeader title="Vendors" description="Suppliers you receive bills from." />

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Add a vendor</h2>
          <form action={createVendorAction} className="grid gap-2 sm:grid-cols-2">
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Name</span><input name="name" required placeholder="Acme Blanks Co." className={`w-full ${inp}`} /></label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Email</span><input name="email" type="email" className={`w-full ${inp}`} /></label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Phone</span><input name="phone" className={`w-full ${inp}`} /></label>
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Terms</span><input name="terms" placeholder="Net 30" className={`w-full ${inp}`} /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Default expense account <span className="text-neutral-400">bills from this vendor suggest it</span></span>
              <select name="defaultAccountId" defaultValue="" className={`w-full ${inp}`}>
                <option value="">— none —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add vendor</button></div>
          </form>
        </Card>
      )}

      <Card className="p-0">
        <ul className="divide-y divide-neutral-100">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No vendors yet.</li>}
          {rows.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <span className={`text-sm font-medium ${v.active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>{v.name}</span>
                <span className="ml-2 text-xs text-neutral-500">{[v.email, v.phone, v.terms].filter(Boolean).join(" · ")}</span>
              </div>
              {editable && <form action={toggleVendorAction}><input type="hidden" name="id" value={v.id} /><button className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">{v.active ? "Disable" : "Enable"}</button></form>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
