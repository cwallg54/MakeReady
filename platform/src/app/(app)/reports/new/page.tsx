import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { ReportBuilder } from "../report-builder";

export const dynamic = "force-dynamic";

export default async function NewReportPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canBuildReports(user.roles)) redirect("/403");
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/reports" className="text-sm text-neutral-500 hover:text-neutral-900">← Reports</Link>
      <PageHeader title="Build a report" description="Pick a data source, choose columns and filters, preview, then save." />
      <Card><ReportBuilder /></Card>
    </div>
  );
}
