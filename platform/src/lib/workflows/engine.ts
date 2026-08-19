import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, activities, workflowRuns } from "@/db/schema";
import { nextDocNumber } from "@/lib/number-series";
import { raiseApproval } from "./approvals";

export interface StepResult { name: string; ok: boolean; detail: string }
export interface WorkflowResult { ok: boolean; steps: StepResult[]; entityType?: string; entityId?: string | null; redirect?: string }

export interface WorkflowField { name: string; label: string; type?: "text" | "email" | "select"; options?: string[]; required?: boolean; placeholder?: string }
export interface WorkflowDef {
  key: string;
  label: string;
  description: string;
  fields: WorkflowField[];
  run: (input: Record<string, string>, userId: string) => Promise<WorkflowResult>;
}

/**
 * One-click workflows chain steps that are otherwise separate screens. Each
 * definition declares its input fields and a run() that performs the steps and
 * returns a per-step outcome. Runs are logged to workflow_runs.
 */
export const WORKFLOWS: WorkflowDef[] = [
  {
    key: "onboard-customer",
    label: "Onboard a new customer",
    description: "Create the Business Partner as a Lead, log the first activity, and raise a credit review — in one action instead of three screens.",
    fields: [
      { name: "companyName", label: "Company name", required: true, placeholder: "Summit Trading Co." },
      { name: "email", label: "Contact email", type: "email", placeholder: "buyer@summit.com" },
      { name: "phone", label: "Phone", placeholder: "(801) 555-0100" },
      { name: "leadSource", label: "Lead source", placeholder: "Trade show, referral…" },
    ],
    async run(input, userId) {
      const steps: StepResult[] = [];
      const bpNumber = await nextDocNumber("business_partner", "BP-");
      const [bp] = await db.insert(businessPartners).values({
        bpNumber,
        companyName: input.companyName?.trim() || "New customer",
        lifecycleStage: "lead",
        leadSource: input.leadSource?.trim() || "workflow",
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        ownerId: userId,
      }).returning({ id: businessPartners.id, num: businessPartners.bpNumber });
      steps.push({ name: "Create Business Partner", ok: true, detail: `Created ${bp.num} at Lead stage` });

      await db.insert(activities).values({ bpId: bp.id, userId, type: "note", content: "Account onboarded via one-click workflow.", isSystem: true });
      steps.push({ name: "Log first activity", ok: true, detail: "Onboarding note added to the timeline" });

      try {
        await raiseApproval({ entityType: "customer", entityId: bp.id, title: `Credit review — ${input.companyName?.trim() || bp.num}`, approverRole: "finance", requestedBy: userId });
        steps.push({ name: "Request credit review", ok: true, detail: "Finance notified to review credit" });
      } catch {
        steps.push({ name: "Request credit review", ok: false, detail: "Could not raise the credit review" });
      }

      return { ok: true, steps, entityType: "business_partner", entityId: bp.id, redirect: `/crm/${bp.id}` };
    },
  },
];

export function getWorkflow(key: string): WorkflowDef | undefined {
  return WORKFLOWS.find((w) => w.key === key);
}

export async function runWorkflow(key: string, input: Record<string, string>, userId: string): Promise<WorkflowResult & { runId?: string }> {
  const def = getWorkflow(key);
  if (!def) return { ok: false, steps: [{ name: "Unknown workflow", ok: false, detail: key }] };
  let result: WorkflowResult;
  try {
    result = await def.run(input, userId);
  } catch (e) {
    result = { ok: false, steps: [{ name: def.label, ok: false, detail: e instanceof Error ? e.message : "Workflow failed" }] };
  }
  const [run] = await db.insert(workflowRuns).values({
    workflowKey: key, label: def.label, status: result.ok ? "completed" : "failed",
    steps: result.steps, entityType: result.entityType ?? null, entityId: result.entityId ?? null, startedBy: userId,
  }).returning({ id: workflowRuns.id });
  return { ...result, runId: run.id };
}

export function recentRuns(limit = 25) {
  return db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt)).limit(limit);
}
