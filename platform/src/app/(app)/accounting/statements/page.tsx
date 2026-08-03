import { requireModule } from "@/lib/auth/guards";
import { redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { BpSearchSelect } from "@/components/crm/bp-search-select";

export const dynamic = "force-dynamic";

async function goToStatement(formData: FormData) {
  "use server";
  const bpId = String(formData.get("bpId") ?? "");
  redirect(bpId ? `/accounting/statements/${bpId}` : "/accounting/statements");
}

export default async function StatementsPage() {
  await requireModule("accounting");
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title="Statements" description="Generate a customer account statement — open invoices, aging, and balance due." />
      <Card>
        <form action={goToStatement} className="space-y-3">
          <label className="block text-xs font-medium text-neutral-500">Customer
            <div className="mt-1"><BpSearchSelect name="bpId" placeholder="Search customer…" /></div>
          </label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">View statement →</button>
        </form>
      </Card>
    </div>
  );
}
