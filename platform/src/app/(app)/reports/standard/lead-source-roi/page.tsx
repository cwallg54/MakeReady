import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { money0 } from "@/lib/reports/standard";
import { getLeadSourceRoi } from "@/lib/reports/analytics-data";

export const dynamic = "force-dynamic";

export default async function LeadSourceRoiPage() {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const rows = await getLeadSourceRoi();

  const tot = rows.reduce((a, r) => ({ accounts: a.accounts + r.accounts, customers: a.customers + r.customers, revenue: a.revenue + r.revenue }), { accounts: 0, customers: 0, revenue: 0 });

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader
        title="Lead-Source ROI"
        description="Where the business comes from — accounts, conversions, and lifetime revenue by lead source."
        action={
          <Link href="/reports/standard/lead-source-roi/export" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV ↓</Link>
        }
      />

      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-400">No accounts yet.</p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-wide text-neutral-400">
                <th className="px-5 py-2">Lead source</th><th className="px-5 py-2 text-right">Accounts</th><th className="px-5 py-2 text-right">Customers</th><th className="px-5 py-2 text-right">Conv.</th><th className="px-5 py-2 text-right">Revenue</th><th className="px-5 py-2 text-right">Per account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.source}>
                  <td className="px-5 py-2 text-neutral-800">{r.source}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-neutral-600">{r.accounts.toLocaleString()}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-neutral-600">{r.customers.toLocaleString()}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-neutral-500">{r.accounts ? Math.round((r.customers / r.accounts) * 100) : 0}%</td>
                  <td className="px-5 py-2 text-right tabular-nums font-medium text-neutral-900">{money0(r.revenue) || "$0"}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-neutral-600">{money0(r.perAccount) || "$0"}</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-200 text-xs font-semibold text-neutral-800">
                <td className="px-5 py-2">Total</td>
                <td className="px-5 py-2 text-right tabular-nums">{tot.accounts.toLocaleString()}</td>
                <td className="px-5 py-2 text-right tabular-nums">{tot.customers.toLocaleString()}</td>
                <td className="px-5 py-2 text-right tabular-nums">{tot.accounts ? Math.round((tot.customers / tot.accounts) * 100) : 0}%</td>
                <td className="px-5 py-2 text-right tabular-nums">{money0(tot.revenue) || "$0"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-xs text-neutral-400">Revenue is lifetime: migrated SAP order history plus current sales orders, summed for every account carrying that lead source. Accounts without a source show as “(unspecified).”</p>
    </div>
  );
}
