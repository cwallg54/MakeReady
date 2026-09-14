import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportDefinitions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { type ReportConfig } from "@/lib/reports/sources";
import { accessForCustom } from "@/lib/reports/access";
import { PageHeader, Card } from "@/components/ui";
import { ReportBuilder } from "../../report-builder";

export const dynamic = "force-dynamic";

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const def = await db.query.reportDefinitions.findFirst({ where: eq(reportDefinitions.id, id) });
  if (!def) notFound();
  // Editing is per report: its owner, an administrator, or a granted editor.
  const access = await accessForCustom(user, def);
  if (!access.edit) redirect("/403");
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
