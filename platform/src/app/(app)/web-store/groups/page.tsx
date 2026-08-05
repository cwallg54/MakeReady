import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { storeCustomerGroups, storeCustomers } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { addStoreGroupAction, toggleStoreGroupAction } from "@/lib/store/actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export default async function StoreGroupsPage() {
  const user = await requireModule("web_store");
  if (!canEdit(user.roles, "web_store")) redirect("/web-store");

  const rows = await db
    .select({ id: storeCustomerGroups.id, name: storeCustomerGroups.name, discountPct: storeCustomerGroups.discountPct, active: storeCustomerGroups.active, n: sql<number>`count(${storeCustomers.id})::int` })
    .from(storeCustomerGroups)
    .leftJoin(storeCustomers, eq(storeCustomers.groupId, storeCustomerGroups.id))
    .groupBy(storeCustomerGroups.id)
    .orderBy(asc(storeCustomerGroups.name));

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader title="Customer pricing groups" description="Give a group of Business Partners an extra discount on top of their price. Assign customers to a group under Customers." />

      <Card>
        <form action={addStoreGroupAction} className="flex flex-wrap items-end gap-2">
          <label className="flex-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Group name</span><input name="name" required placeholder="Wholesale, Distributor…" className={`w-full ${inp}`} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">Discount %</span><input name="discountPct" type="number" step="0.5" min="0" max="100" defaultValue="0" className={`w-28 ${inp}`} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add group</button>
        </form>
      </Card>

      <Card className="p-0">
        <ul className="divide-y divide-neutral-100">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No pricing groups yet.</li>}
          {rows.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <span className={`text-sm font-medium ${g.active ? "text-neutral-900" : "text-neutral-400 line-through"}`}>{g.name}</span>
                <span className="ml-2 text-xs text-neutral-500">{Number(g.discountPct)}% off · {g.n} customer{g.n === 1 ? "" : "s"}</span>
              </div>
              <form action={toggleStoreGroupAction}><input type="hidden" name="id" value={g.id} /><button className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">{g.active ? "Disable" : "Enable"}</button></form>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
