import Link from "next/link";
import { and, asc, count, eq, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, crmScopedToOwn } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners, users } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { PipelineBoard } from "./pipeline-board";

const STAGES = ["lead", "prospect", "customer"] as const;
const PER_COLUMN = 100;

export default async function PipelinePage() {
  const user = await requireModule("crm");
  const editable = canEdit(user.roles, "crm");
  const scoped = crmScopedToOwn(user.roles);
  const scope: SQL | undefined = scoped ? eq(businessPartners.ownerId, user.id) : undefined;

  const cols = {
    id: businessPartners.id,
    companyName: businessPartners.companyName,
    stage: businessPartners.lifecycleStage,
    leadSource: businessPartners.leadSource,
    tags: businessPartners.tags,
    ownerName: users.name,
  };

  // True totals per column (cheap grouped count), plus up to PER_COLUMN cards
  // per stage — never the whole 7k-customer table. All in one parallel batch.
  const [countRows, ...perStage] = await Promise.all([
    db.select({ stage: businessPartners.lifecycleStage, n: count() }).from(businessPartners).where(scope).groupBy(businessPartners.lifecycleStage),
    ...STAGES.map((s) =>
      db.select(cols).from(businessPartners).leftJoin(users, eq(businessPartners.ownerId, users.id))
        .where(scope ? and(scope, eq(businessPartners.lifecycleStage, s)) : eq(businessPartners.lifecycleStage, s))
        .orderBy(asc(businessPartners.companyName)).limit(PER_COLUMN),
    ),
  ]);
  const cards = perStage.flat();
  const counts: Record<string, number> = {};
  for (const r of countRows) counts[r.stage] = r.n;

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Drag accounts through Lead → Prospect → Customer."
        action={
          <Link href="/crm" className="hidden rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 lg:inline-block">
            List view
          </Link>
        }
      />

      {/* Mobile view toggle (desktop uses the header button above) */}
      <div className="mb-4 inline-flex overflow-hidden rounded-lg border border-neutral-300 lg:hidden">
        <Link href="/crm" className="bg-white px-4 py-1.5 text-sm font-semibold text-neutral-700 active:bg-neutral-50">List</Link>
        <span className="bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white">Board</span>
      </div>

      <PipelineBoard cards={cards} counts={counts} editable={editable} />
    </div>
  );
}
