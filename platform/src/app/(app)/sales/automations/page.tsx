import Link from "next/link";
import { asc, eq, count } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { automationCampaigns, automationSteps, automationEnrollments } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { CampaignCreateForm } from "./campaign-create-form";

export default async function AutomationsPage() {
  await requireModule("sales");
  const campaigns = await db.select().from(automationCampaigns).orderBy(asc(automationCampaigns.name));
  const rows = await Promise.all(
    campaigns.map(async (c) => {
      const [{ s }] = await db.select({ s: count() }).from(automationSteps).where(eq(automationSteps.campaignId, c.id));
      const [{ e }] = await db.select({ e: count() }).from(automationEnrollments).where(eq(automationEnrollments.campaignId, c.id));
      return { ...c, steps: s, enrollments: e };
    }),
  );

  return (
    <div>
      <PageHeader title="Sales Automations" description="Drip campaigns that create tasks, notify owners, and email customers on a schedule." />
      <div className="max-w-3xl space-y-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">New drip campaign</h2>
          <CampaignCreateForm />
        </Card>
        <Card className="p-0">
          <div className="border-b border-neutral-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-neutral-900">Campaigns ({rows.length})</h2>
            <p className="text-xs text-neutral-500">Timed sequences that create tasks, notify owners, and email customers. Runs daily.</p>
          </div>
          <ul className="divide-y divide-neutral-100">
            {rows.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-400">No campaigns yet.</li>}
            {rows.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <Link href={`/sales/automations/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.name}</Link>
                  {!c.active && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600">inactive</span>}
                  <p className="text-xs text-neutral-500">{c.trigger === "lead_created" ? "Auto-enrolls new leads" : "Manual"} · {c.steps} steps · {c.enrollments} enrolled</p>
                </div>
                <Link href={`/sales/automations/${c.id}`} className="text-sm text-neutral-600 hover:text-neutral-900">Edit</Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
