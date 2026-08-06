import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { vendors } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { createBillAction } from "@/lib/accounting/ap-actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function NewBillPage() {
  const user = await requireModule("accounting");
  if (!canEdit(user.roles, "accounting")) redirect("/accounting/bills");
  const vs = await db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(eq(vendors.active, true)).orderBy(asc(vendors.name));

  return (
    <div className="max-w-lg space-y-6">
      <Link href="/accounting/bills" className="text-sm text-neutral-500 hover:text-neutral-900">← Bills</Link>
      <PageHeader title="New bill" description="Create the bill, then add its lines and approve it." />
      <Card>
        <form action={createBillAction} className="space-y-3">
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600">Vendor</span>
            <select name="vendorId" className={`w-full ${inp}`}>
              <option value="">— choose a vendor —</option>
              {vs.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-neutral-600">Vendor invoice # <span className="text-neutral-400">optional</span></span><input name="vendorRef" placeholder="Their invoice number" className={`w-full ${inp}`} /></label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create bill</button>
          {vs.length === 0 && <p className="text-xs text-amber-700">No vendors yet — <Link href="/accounting/vendors" className="underline">add one first</Link>.</p>}
        </form>
      </Card>
    </div>
  );
}
