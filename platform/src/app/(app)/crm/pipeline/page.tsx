import Link from "next/link";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, crmScopedToOwn } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners, users } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { setStageAction } from "@/lib/crm/actions";

const STAGES = [
  { key: "lead", label: "Leads", accent: "border-t-amber-400" },
  { key: "prospect", label: "Prospects", accent: "border-t-blue-400" },
  { key: "customer", label: "Customers", accent: "border-t-emerald-400" },
] as const;

const NEXT: Record<string, { to: "lead" | "prospect" | "customer"; label: string }[]> = {
  lead: [{ to: "prospect", label: "→ Prospect" }],
  prospect: [{ to: "lead", label: "← Lead" }, { to: "customer", label: "→ Customer" }],
  customer: [{ to: "prospect", label: "← Prospect" }],
};

export default async function PipelinePage() {
  const user = await requireModule("crm");
  const editable = canEdit(user.roles, "crm");
  const scoped = crmScopedToOwn(user.roles);

  const conditions: SQL[] = [];
  if (scoped) conditions.push(eq(businessPartners.ownerId, user.id));

  const rows = await db
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

  const byStage = (s: string) => rows.filter((r) => r.stage === s);

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Move accounts through Lead → Prospect → Customer."
        action={
          <Link href="/crm" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
            List view
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {STAGES.map((col) => {
          const items = byStage(col.key);
          return (
            <div key={col.key} className={`rounded-lg border border-neutral-200 border-t-4 ${col.accent} bg-neutral-50`}>
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-semibold text-neutral-900">{col.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-500">{items.length}</span>
              </div>
              <div className="space-y-2 px-3 pb-3">
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-neutral-400">Nothing here yet.</p>}
                {items.map((r) => (
                  <Card key={r.id} className="p-3">
                    <Link href={`/crm/${r.id}`} className="text-sm font-medium text-neutral-900 hover:underline">{r.companyName}</Link>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {r.ownerName ?? "Unassigned"}{r.leadSource ? ` · ${r.leadSource}` : ""}
                    </p>
                    {r.tags && r.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">{t}</span>
                        ))}
                      </div>
                    )}
                    {editable && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {NEXT[col.key].map((n) => (
                          <form key={n.to} action={setStageAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="stage" value={n.to} />
                            <button className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100">{n.label}</button>
                          </form>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
