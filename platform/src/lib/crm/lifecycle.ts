import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, activities } from "@/db/schema";
import { audit } from "@/lib/audit";

export type LifecycleStage = "lead" | "prospect" | "customer";
const ORDER: LifecycleStage[] = ["lead", "prospect", "customer"];
const LABEL: Record<LifecycleStage, string> = { lead: "Lead", prospect: "Prospect", customer: "Customer" };

/**
 * Move a BP forward in the pipeline when a real signal fires (e.g. they filled
 * out a credit application, or booked a meeting). Forward-only — never demotes,
 * and never overrides a manual promotion to Customer. Logs the reason.
 */
export async function advanceLifecycle(bpId: string, to: LifecycleStage, reason: string, userId?: string): Promise<void> {
  if (!bpId) return;
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId), columns: { lifecycleStage: true } });
  if (!bp) return;
  const current = (bp.lifecycleStage ?? "lead") as LifecycleStage;
  if (ORDER.indexOf(to) <= ORDER.indexOf(current)) return; // already at/past this stage
  await db.update(businessPartners).set({ lifecycleStage: to, updatedAt: new Date() }).where(eq(businessPartners.id, bpId));
  await db.insert(activities).values({ bpId, userId: userId ?? null, type: "other", isSystem: true, content: `Auto-advanced to ${LABEL[to]} — ${reason}` });
  await audit({ userId: userId ?? null, action: "crm.lifecycle_auto", entityType: "business_partner", entityId: bpId, metadata: { to, reason } });
}
