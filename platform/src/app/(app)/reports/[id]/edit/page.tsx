import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canBuildReports, type ReportConfig } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { ReportBuilder } from "../../report-builder";

export const dynamic = "force-dynamic";

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canBuildReports(user.roles)) redirect("/403");
  const { id } = await params;
  const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, id) });
  if (!def) notFound();
  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/reports/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {def.name}</Link>
      <PageHeader title="Edit report" description={def.name} />
      <Card>
        <ReportBuilder initial={{ id: def.id, name: def.name, description: def.description ?? "", source: def.source, config: def.config as ReportConfig }} />
      </Card>
    </div>
  );
}
