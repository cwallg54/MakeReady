import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  automationCampaigns,
  automationSteps,
  automationEnrollments,
  crmTasks,
  notifications,
  activities,
  contacts,
  businessPartners,
  type AutomationStep,
} from "@/db/schema";
import { sendReminderEmail } from "@/lib/email";

const DAY = 86_400_000;

async function stepsFor(campaignId: string): Promise<AutomationStep[]> {
  return db
    .select()
    .from(automationSteps)
    .where(eq(automationSteps.campaignId, campaignId))
    .orderBy(asc(automationSteps.sortOrder), asc(automationSteps.dayOffset));
}

/** Enroll a Business Partner into all active campaigns matching a trigger. */
export async function enrollBp(bpId: string, trigger: "lead_created" | "manual", campaignId?: string): Promise<void> {
  const campaigns = campaignId
    ? await db.select().from(automationCampaigns).where(eq(automationCampaigns.id, campaignId))
    : await db.select().from(automationCampaigns).where(and(eq(automationCampaigns.active, true), eq(automationCampaigns.trigger, trigger)));

  for (const c of campaigns) {
    const existing = await db.query.automationEnrollments.findFirst({
      where: and(eq(automationEnrollments.campaignId, c.id), eq(automationEnrollments.bpId, bpId), eq(automationEnrollments.status, "active")),
    });
    if (existing) continue;
    const steps = await stepsFor(c.id);
    const now = new Date();
    const nextRunAt = steps.length ? new Date(now.getTime() + steps[0].dayOffset * DAY) : null;
    await db.insert(automationEnrollments).values({
      campaignId: c.id,
      bpId,
      status: steps.length ? "active" : "completed",
      nextStepIndex: 0,
      nextRunAt,
      enrolledAt: now,
    });
  }
}

async function primaryEmail(bpId: string, fallback: string | null): Promise<string> {
  const c = await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, bpId), eq(contacts.isPrimary, true)) });
  return c?.email ?? fallback ?? "";
}

async function executeStep(bp: typeof businessPartners.$inferSelect, step: AutomationStep): Promise<void> {
  if (step.actionType === "create_task") {
    await db.insert(crmTasks).values({
      bpId: bp.id,
      title: step.taskTitle || "Follow up",
      assignedToId: bp.ownerId ?? null,
      dueDate: new Date(Date.now() + (step.dueDays ?? 0) * DAY),
    });
    await db.insert(activities).values({ bpId: bp.id, type: "other", isSystem: true, content: `Automation: created task “${step.taskTitle || "Follow up"}”` });
  } else if (step.actionType === "notify_owner") {
    if (bp.ownerId) {
      await db.insert(notifications).values({
        userId: bp.ownerId,
        type: "automation",
        title: step.notifyMessage || `Follow up with ${bp.companyName}`,
        body: `Automated reminder for ${bp.companyName}.`,
        link: `/crm/${bp.id}`,
      });
    }
    await db.insert(activities).values({ bpId: bp.id, type: "other", isSystem: true, content: `Automation: notified owner` });
  } else if (step.actionType === "email_customer") {
    const to = await primaryEmail(bp.id, bp.email);
    if (to) {
      const sent = await sendReminderEmail(to, step.emailSubject || "A message from Great Mountain West", (step.emailBody || "").replace(/\{company\}/g, bp.companyName));
      await db.insert(activities).values({ bpId: bp.id, type: "email", isSystem: true, content: `Automation: reminder email ${sent ? "sent" : "queued (email not yet configured)"} to ${to}` });
    }
  }
}

/** Scheduler worker — run all due enrollment steps. Returns number of steps fired. */
export async function runDueAutomations(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(automationEnrollments)
    .where(and(eq(automationEnrollments.status, "active"), lte(automationEnrollments.nextRunAt, now)))
    .limit(500);

  let fired = 0;
  for (const en of due) {
    const steps = await stepsFor(en.campaignId);
    const step = steps[en.nextStepIndex];
    if (!step) {
      await db.update(automationEnrollments).set({ status: "completed" }).where(eq(automationEnrollments.id, en.id));
      continue;
    }
    const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, en.bpId) });
    if (!bp) {
      await db.update(automationEnrollments).set({ status: "stopped" }).where(eq(automationEnrollments.id, en.id));
      continue;
    }
    await executeStep(bp, step);
    fired++;

    const nextIndex = en.nextStepIndex + 1;
    const nextStep = steps[nextIndex];
    if (nextStep) {
      await db
        .update(automationEnrollments)
        .set({ nextStepIndex: nextIndex, nextRunAt: new Date(en.enrolledAt.getTime() + nextStep.dayOffset * DAY), lastRunAt: now })
        .where(eq(automationEnrollments.id, en.id));
    } else {
      await db.update(automationEnrollments).set({ status: "completed", lastRunAt: now, nextRunAt: null }).where(eq(automationEnrollments.id, en.id));
    }
  }
  return fired;
}
