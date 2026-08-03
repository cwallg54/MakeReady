import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { BpSearchSelect } from "@/components/crm/bp-search-select";
import { createBlankInvoiceAction } from "@/lib/accounting/actions";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
  const user = await requireModule("accounting");
  if (!canEdit(user.roles, "accounting")) redirect("/accounting/invoices");

  return (
    <div className="max-w-xl space-y-6">
      <Link href="/accounting/invoices" className="text-sm text-neutral-500 hover:text-neutral-900">← Invoices</Link>
      <PageHeader title="New invoice" description="Bill a customer directly, then add line items." />
      <Card>
        <form action={createBlankInvoiceAction} className="space-y-3">
          <label className="block text-xs font-medium text-neutral-500">Customer
            <div className="mt-1"><BpSearchSelect name="bpId" placeholder="Search customer by name or BP #…" /></div>
          </label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create invoice →</button>
        </form>
        <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">To bill a specific order, open a delivered order and use <strong>Create invoice</strong> — its lines are copied automatically.</p>
      </Card>
    </div>
  );
}
