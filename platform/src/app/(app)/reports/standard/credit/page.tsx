import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { BpSearchSelect } from "@/components/crm/bp-search-select";

export const dynamic = "force-dynamic";

export default async function CreditPickerPage() {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");

  return (
    <div className="max-w-xl space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader title="Customer Credit Report" description="Pick a customer to view their credit profile, trailing sales, open orders, and collection activity." />
      <Card>
        <form action="/reports/standard/credit/go" method="get" className="space-y-3">
          <label className="block text-xs font-medium text-neutral-500">Customer</label>
          <BpSearchSelect name="bpId" placeholder="Search customer by name or BP #…" />
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">View credit report →</button>
        </form>
      </Card>
    </div>
  );
}
