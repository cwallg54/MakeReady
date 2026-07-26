import Link from "next/link";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, crmScopedToOwn } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners, users } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { PipelineBoard } from "./pipeline-board";

export default async function PipelinePage() {
  const user = await requireModule("crm");
  const editable = canEdit(user.roles, "crm");
  const scoped = crmScopedToOwn(user.roles);

  const conditions: SQL[] = [];
  if (scoped) conditions.push(eq(businessPartners.ownerId, user.id));

  const cards = await db
    .select({
      id: businessPartners.id,
      companyName: businessPartners.companyName,
      stage: businessPartners.lifecycleStage,
      leadSource: businessPartners.leadSource,
      tags: businessPartners.tags,
      ownerName: users.name,
    })
    .from(businessPartners)
    .leftJoin(users, eq(businessPartners.ownerId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(businessPartners.companyName))
    .limit(500);

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Drag accounts through Lead → Prospect → Customer."
        action={
          <Link href="/crm" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
            List view
          </Link>
        }
      />
      <PipelineBoard cards={cards} editable={editable} />
    </div>
  );
}
