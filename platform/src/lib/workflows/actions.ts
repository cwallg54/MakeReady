"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { approvalRules } from "@/db/schema";
import type { Role } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit, isAdmin, ROLES } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runWorkflow, getWorkflow } from "./engine";
import { decideApproval } from "./approvals";

async function requireWorkflowView() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "workflows")) redirect("/403");
  return user;
}
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[$,%]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export async function runWorkflowAction(formData: FormData): Promise<void> {
  const user = await requireWorkflowView();
  const key = String(formData.get("workflowKey") ?? "");
  const def = getWorkflow(key);
  if (!def) redirect("/workflows");
  const input: Record<string, string> = {};
  for (const f of def.fields) input[f.name] = String(formData.get(f.name) ?? "");
  const result = await runWorkflow(key, input, user.id);
  await audit({ userId: user.id, action: "workflow.run", entityType: "workflow", entityId: key, metadata: { ok: result.ok } });
  redirect(result.ok && result.redirect ? result.redirect : "/workflows");
}

export async function decideApprovalAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/403");
  const id = String(formData.get("id") ?? "");
  const approve = formData.get("decision") === "approve";
  if (!id) return;
  // Only a holder of the request's approver role (or admin) may decide.
  const { approvalRequests } = await import("@/db/schema");
  const req = await db.query.approvalRequests.findFirst({ where: eq(approvalRequests.id, id), columns: { approverRole: true } });
  if (!req) return;
  if (!isAdmin(user.roles) && !user.roles.includes(req.approverRole)) redirect("/403");
  await decideApproval(id, approve, str(formData.get("note")) ?? "", user.id);
  await audit({ userId: user.id, action: approve ? "approval.approve" : "approval.reject", entityType: "approval_request", entityId: id });
  revalidatePath("/workflows/approvals");
}

// ── Approval-rule administration (admins) ──────────────────────────────────
async function requireRulesAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.roles)) redirect("/403");
  return user;
}

export async function createRuleAction(formData: FormData): Promise<void> {
  const user = await requireRulesAdmin();
  const approverRole = String(formData.get("approverRole") ?? "sales_manager");
  await db.insert(approvalRules).values({
    name: str(formData.get("name")) ?? "New rule",
    entityType: str(formData.get("entityType")) ?? "order",
    metric: str(formData.get("metric")) ?? "amount",
    operator: str(formData.get("operator")) === "gt" ? "gt" : "gte",
    threshold: num(formData.get("threshold")).toFixed(2),
    approverRole: (ROLES.includes(approverRole as Role) ? approverRole : "sales_manager") as Role,
    createdBy: user.id,
  });
  await audit({ userId: user.id, action: "approval_rule.create", entityType: "approval_rule" });
  revalidatePath("/workflows/rules");
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const user = await requireRulesAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const rule = await db.query.approvalRules.findFirst({ where: eq(approvalRules.id, id), columns: { active: true } });
  if (!rule) return;
  await db.update(approvalRules).set({ active: !rule.active }).where(eq(approvalRules.id, id));
  await audit({ userId: user.id, action: "approval_rule.toggle", entityType: "approval_rule", entityId: id });
  revalidatePath("/workflows/rules");
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const user = await requireRulesAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(approvalRules).where(eq(approvalRules.id, id));
  await audit({ userId: user.id, action: "approval_rule.delete", entityType: "approval_rule", entityId: id });
  revalidatePath("/workflows/rules");
}
