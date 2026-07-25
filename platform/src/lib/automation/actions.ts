"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { automationCampaigns, automationSteps } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { audit } from "@/lib/audit";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes("admin")) redirect("/403");
  return user;
}

export interface CampaignState {
  error?: string;
}

export async function createCampaignAction(_prev: CampaignState, formData: FormData): Promise<CampaignState> {
  const admin = await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  const trigger = String(formData.get("trigger") ?? "manual") === "lead_created" ? "lead_created" : "manual";
  const [c] = await db
    .insert(automationCampaigns)
    .values({ name, description: String(formData.get("description") ?? "").trim() || null, trigger })
    .returning({ id: automationCampaigns.id });
  await audit({ userId: admin.id, action: "campaign.create", entityType: "automation_campaign", entityId: c.id, metadata: { name } });
  redirect(`/admin/automations/${c.id}`);
}

export async function updateCampaignAction(_prev: CampaignState, formData: FormData): Promise<CampaignState> {
  const admin = await assertAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Name is required." };
  await db
    .update(automationCampaigns)
    .set({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      trigger: String(formData.get("trigger") ?? "manual") === "lead_created" ? "lead_created" : "manual",
      active: formData.get("active") === "on",
      updatedAt: new Date(),
    })
    .where(eq(automationCampaigns.id, id));
  await audit({ userId: admin.id, action: "campaign.update", entityType: "automation_campaign", entityId: id });
  revalidatePath(`/admin/automations/${id}`);
  return {};
}

export async function addStepAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const campaignId = String(formData.get("campaignId") ?? "");
  const actionType = String(formData.get("actionType") ?? "");
  if (!campaignId || !["create_task", "notify_owner", "email_customer"].includes(actionType)) return;
  const [{ n }] = await db.select({ n: count() }).from(automationSteps).where(eq(automationSteps.campaignId, campaignId));
  await db.insert(automationSteps).values({
    campaignId,
    dayOffset: Number(formData.get("dayOffset") ?? 0) || 0,
    actionType: actionType as "create_task" | "notify_owner" | "email_customer",
    taskTitle: String(formData.get("taskTitle") ?? "").trim() || null,
    dueDays: Number(formData.get("dueDays") ?? 0) || 0,
    notifyMessage: String(formData.get("notifyMessage") ?? "").trim() || null,
    emailSubject: String(formData.get("emailSubject") ?? "").trim() || null,
    emailBody: String(formData.get("emailBody") ?? "").trim() || null,
    sortOrder: n,
  });
  await audit({ userId: admin.id, action: "campaign.step_add", entityType: "automation_campaign", entityId: campaignId });
  revalidatePath(`/admin/automations/${campaignId}`);
}

export async function removeStepAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const campaignId = String(formData.get("campaignId") ?? "");
  const stepId = String(formData.get("stepId") ?? "");
  await db.delete(automationSteps).where(and(eq(automationSteps.id, stepId), eq(automationSteps.campaignId, campaignId)));
  await audit({ userId: admin.id, action: "campaign.step_remove", entityType: "automation_campaign", entityId: campaignId });
  revalidatePath(`/admin/automations/${campaignId}`);
}
