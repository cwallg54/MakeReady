import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { orderFormTemplates } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { BpSearchSelect } from "@/components/crm/bp-search-select";
import { createQuoteAction } from "@/lib/sales/actions";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ bp?: string; bpName?: string }>;
}) {
  const user = await requireModule("sales");
  if (!canEdit(user.roles, "sales")) redirect("/403");
  const { bp, bpName } = await searchParams;

  const templates = await db.select().from(orderFormTemplates).where(eq(orderFormTemplates.active, true)).orderBy(asc(orderFormTemplates.name));

  const select = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

  return (
    <div className="max-w-lg">
      <Link href="/sales" className="text-sm text-neutral-500 hover:text-neutral-900">← Quotes</Link>
      <PageHeader title="New quote" />
      {templates.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">No order-form templates exist yet. An administrator needs to create one in <Link href="/admin/templates" className="font-medium underline">Administration → Order Templates</Link> first.</p>
        </Card>
      ) : (
        <Card>
          <form action={createQuoteAction} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Customer (Business Partner)</span>
              <BpSearchSelect name="bpId" defaultId={bp ?? ""} defaultLabel={bpName ?? ""} placeholder="Search customer by name or BP #… (leave blank for walk-in)" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Product template</span>
              <select name="templateId" required className={select}>
                {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>
            </label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create &amp; open builder</button>
          </form>
        </Card>
      )}
    </div>
  );
}
