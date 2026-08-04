import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { automationCampaigns, automationSteps } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { addStepAction, removeStepAction } from "@/lib/automation/actions";
import { CampaignMetaForm } from "./campaign-meta-form";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand";
const ACTION_LABEL: Record<string, string> = { create_task: "Create task", notify_owner: "Notify owner", email_customer: "Email customer" };

export default async function CampaignEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("sales");
  const { id } = await params;
  const c = await db.query.automationCampaigns.findFirst({ where: eq(automationCampaigns.id, id) });
  if (!c) notFound();
  const steps = await db.select().from(automationSteps).where(eq(automationSteps.campaignId, id)).orderBy(asc(automationSteps.sortOrder), asc(automationSteps.dayOffset));

  return (
    <div>
      <PageHeader title="Sales Automations" description="Edit this drip campaign and its timed steps." />
      <div className="max-w-3xl space-y-6">
        <Link href="/sales/automations" className="text-sm text-neutral-500 hover:text-neutral-900">← Campaigns</Link>
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">{c.name}</h2>
          <CampaignMetaForm id={c.id} name={c.name} description={c.description ?? ""} trigger={c.trigger} active={c.active} />
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Steps</h2>
          <p className="mb-3 text-xs text-neutral-400">Each step fires N days after a lead is enrolled. The scheduler runs daily.</p>
          <ol className="mb-4 space-y-2">
            {steps.length === 0 && <li className="text-sm text-neutral-400">No steps yet.</li>}
            {steps.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm">
                <span className="text-neutral-800">
                  <span className="font-medium">Day {s.dayOffset}</span> · {ACTION_LABEL[s.actionType]}
                  {s.actionType === "create_task" && s.taskTitle ? ` — “${s.taskTitle}” (due +${s.dueDays}d)` : ""}
                  {s.actionType === "notify_owner" && s.notifyMessage ? ` — “${s.notifyMessage}”` : ""}
                  {s.actionType === "email_customer" && s.emailSubject ? ` — “${s.emailSubject}”` : ""}
                </span>
                <form action={removeStepAction}>
                  <input type="hidden" name="campaignId" value={c.id} />
                  <input type="hidden" name="stepId" value={s.id} />
                  <ConfirmButton message="Remove this step?" className="text-xs text-red-600 hover:text-red-800">Remove</ConfirmButton>
                </form>
              </li>
            ))}
          </ol>

          <form action={addStepAction} className="space-y-2 border-t border-neutral-100 pt-4">
            <input type="hidden" name="campaignId" value={c.id} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="text-xs text-neutral-500">Day offset<input name="dayOffset" type="number" defaultValue={0} className={`mt-1 w-full ${input}`} /></label>
              <label className="text-xs text-neutral-500 sm:col-span-2">Action
                <select name="actionType" className={`mt-1 w-full ${input}`}>
                  <option value="create_task">Create task</option>
                  <option value="notify_owner">Notify owner</option>
                  <option value="email_customer">Email customer</option>
                </select>
              </label>
              <label className="text-xs text-neutral-500">Task due +days<input name="dueDays" type="number" defaultValue={0} className={`mt-1 w-full ${input}`} /></label>
            </div>
            <input name="taskTitle" placeholder="Task title (for Create task)" className={`w-full ${input}`} />
            <input name="notifyMessage" placeholder="Notification message (for Notify owner)" className={`w-full ${input}`} />
            <input name="emailSubject" placeholder="Email subject (for Email customer)" className={`w-full ${input}`} />
            <textarea name="emailBody" rows={2} placeholder="Email body — use {company} for the customer name" className={`w-full ${input}`} />
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add step</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
