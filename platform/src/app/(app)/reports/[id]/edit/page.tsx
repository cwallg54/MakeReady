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

/** Route params are strings, so a path like /reports/access reaches this page
 *  as an "id". Anything that is not a UUID is not a report — 404 rather than
 *  letting Postgres reject the cast and surface a 500. */
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);


export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!isUuid(id)) notFound();
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
