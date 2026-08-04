import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { creditApprovalRequests, systemSettings, notifications, activities, users, userRoles, SYSTEM_SETTINGS_ID } from "@/db/schema";

export interface CreditAssessment {
  hold: boolean;
  overLimit: boolean;
  amountOver: number;
  accountBalance: number;
  creditLimit: number | null;
  blocked: boolean;
}

/** Assess whether an order can proceed on the customer's credit. Pure. */
export function assessCredit(
  bp: { creditHold: boolean; creditLimit: string | null; accountBalance: string | null },
  orderTotal: number,
): CreditAssessment {
  const accountBalance = Number(bp.accountBalance ?? 0);
  const creditLimit = bp.creditLimit != null ? Number(bp.creditLimit) : null;
  const overLimit = creditLimit != null && creditLimit > 0 && accountBalance + orderTotal > creditLimit;
  const amountOver = overLimit && creditLimit != null ? accountBalance + orderTotal - creditLimit : 0;
  const hold = !!bp.creditHold;
  return { hold, overLimit, amountOver, accountBalance, creditLimit, blocked: hold || overLimit };
}

/** The over-limit amount finance can approve without a manager. */
export async function creditApprovalThreshold(): Promise<number> {
  const s = await db.query.systemSettings.findFirst({ where: eq(systemSettings.id, SYSTEM_SETTINGS_ID), columns: { creditApprovalThreshold: true } });
  return Number(s?.creditApprovalThreshold ?? 5000);
}

/**
 * Open a pending credit-approval request for a blocked order (deduped per quote)
 * and notify Finance/Admin. Returns the request id, or null if the assessment
 * isn't actually blocked.
 */
export async function openCreditRequest(opts: {
  quoteId: string;
  bpId: string | null;
  orderTotal: number;
  assessment: CreditAssessment;
  requestedBy: string | null;
}): Promise<string | null> {
  const { quoteId, bpId, orderTotal, assessment, requestedBy } = opts;
  if (!assessment.blocked) return null;
  const existing = await db.query.creditApprovalRequests.findFirst({
    where: and(eq(creditApprovalRequests.quoteId, quoteId), eq(creditApprovalRequests.status, "pending")),
  });
  if (existing) return existing.id;

  const reason = assessment.hold ? "hold" : "over_limit";
  const [r] = await db
    .insert(creditApprovalRequests)
    .values({
      quoteId,
      bpId,
      reason,
      amount: String(orderTotal.toFixed(2)),
      accountBalance: String(assessment.accountBalance.toFixed(2)),
      creditLimit: assessment.creditLimit != null ? String(assessment.creditLimit.toFixed(2)) : null,
      amountOver: String(assessment.amountOver.toFixed(2)),
      requestedBy,
    })
    .returning({ id: creditApprovalRequests.id });

  const financeUsers = await db
    .selectDistinct({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, "active"), inArray(userRoles.role, ["finance", "admin"])));
  const label = reason === "hold" ? "customer is on credit hold" : `$${assessment.amountOver.toFixed(0)} over limit`;
  for (const u of financeUsers) {
    await db.insert(notifications).values({
      userId: u.id,
      type: "task",
      title: "Credit approval needed",
      body: `An order needs credit review (${label}).`,
      link: "/accounting/credit-requests",
    });
  }
  if (bpId) {
    await db.insert(activities).values({ bpId, userId: requestedBy, type: "note", isSystem: true, content: `Order submitted for finance credit review (${label})` });
  }
  return r.id;
}
