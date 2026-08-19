import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { approvalRules, approvalRequests, notifications, userRoles } from "@/db/schema";
import type { Role } from "@/db/schema";
import { nextDocNumber } from "@/lib/number-series";

export interface ApprovalContext {
  entityType: string;
  entityId?: string | null;
  title: string;
  amount?: number;
  discountPct?: number;
  requestedBy: string;
}

/** Notify every holder of a role that an approval is waiting. Best-effort. */
async function notifyApprovers(role: Role, title: string, body: string, link: string) {
  try {
    const rows = await db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.role, role));
    const ids = Array.from(new Set(rows.map((r) => r.userId)));
    if (ids.length) await db.insert(notifications).values(ids.map((userId) => ({ userId, type: "approval" as const, title, body, link })));
  } catch { /* best effort */ }
}

/**
 * Evaluate the active approval rules for an entity against a context. Any rule
 * whose threshold is crossed raises a pending approval request (deduped per
 * entity+rule). Returns the requests created. Best-effort — never throws into
 * the calling flow.
 */
export async function evaluateApprovals(ctx: ApprovalContext): Promise<{ created: number; pending: boolean }> {
  try {
    const rules = await db.select().from(approvalRules).where(and(eq(approvalRules.active, true), eq(approvalRules.entityType, ctx.entityType)));
    let created = 0;
    for (const rule of rules) {
      const value = rule.metric === "discount_pct" ? ctx.discountPct ?? 0 : ctx.amount ?? 0;
      const threshold = Number(rule.threshold);
      const crosses = rule.operator === "gt" ? value > threshold : value >= threshold;
      if (!crosses) continue;

      // Dedupe: don't raise a second pending request for the same entity+rule.
      if (ctx.entityId) {
        const existing = await db.query.approvalRequests.findFirst({
          where: and(eq(approvalRequests.ruleId, rule.id), eq(approvalRequests.entityId, ctx.entityId), eq(approvalRequests.status, "pending")),
          columns: { id: true },
        });
        if (existing) continue;
      }

      const requestNumber = await nextDocNumber("approval_request", "APR-");
      await db.insert(approvalRequests).values({
        requestNumber, ruleId: rule.id, entityType: ctx.entityType, entityId: ctx.entityId ?? null,
        title: ctx.title, amount: ctx.amount != null ? ctx.amount.toFixed(2) : null,
        approverRole: rule.approverRole, requestedBy: ctx.requestedBy,
      });
      created++;
      await notifyApprovers(rule.approverRole, "Approval needed", `${ctx.title} — ${rule.name}`, "/workflows/approvals");
    }
    return { created, pending: created > 0 };
  } catch (e) {
    console.error("evaluateApprovals failed", e);
    return { created: 0, pending: false };
  }
}

/** Raise an approval request manually (no rule). */
export async function raiseApproval(ctx: ApprovalContext & { approverRole: Role }): Promise<string> {
  const requestNumber = await nextDocNumber("approval_request", "APR-");
  const [row] = await db.insert(approvalRequests).values({
    requestNumber, entityType: ctx.entityType, entityId: ctx.entityId ?? null, title: ctx.title,
    amount: ctx.amount != null ? ctx.amount.toFixed(2) : null, approverRole: ctx.approverRole, requestedBy: ctx.requestedBy,
  }).returning({ id: approvalRequests.id });
  await notifyApprovers(ctx.approverRole, "Approval needed", ctx.title, "/workflows/approvals");
  return row.id;
}

export async function decideApproval(id: string, approve: boolean, note: string, userId: string): Promise<{ ok: boolean }> {
  const req = await db.query.approvalRequests.findFirst({ where: eq(approvalRequests.id, id) });
  if (!req || req.status !== "pending") return { ok: false };
  await db.update(approvalRequests).set({
    status: approve ? "approved" : "rejected", decidedBy: userId, decidedAt: new Date(), note: note || null,
  }).where(eq(approvalRequests.id, id));
  // Tell the requester the outcome.
  if (req.requestedBy) {
    try {
      await db.insert(notifications).values({
        userId: req.requestedBy, type: "approval",
        title: approve ? "Approved" : "Rejected", body: `${req.title} was ${approve ? "approved" : "rejected"}.${note ? ` “${note}”` : ""}`,
        link: "/workflows/approvals",
      });
    } catch { /* best effort */ }
  }
  return { ok: true };
}

/** Approval requests a user may act on (by their roles) + their own requests. */
export async function approvalsForUser(roles: Role[]) {
  const pending = await db
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.status, "pending"), inArray(approvalRequests.approverRole, roles.length ? roles : ["sales_manager"])))
    .orderBy(desc(approvalRequests.createdAt));
  const recent = await db.select().from(approvalRequests).where(inArray(approvalRequests.status, ["approved", "rejected"])).orderBy(desc(approvalRequests.decidedAt)).limit(25);
  return { pending, recent };
}

export function listRules() {
  return db.select().from(approvalRules).orderBy(desc(approvalRules.createdAt));
}
