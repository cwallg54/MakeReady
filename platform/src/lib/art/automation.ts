import { eq } from "drizzle-orm";
import { db } from "@/db";
import { artRequests, orderProofs, orders } from "@/db/schema";
import { notifyTeam } from "@/lib/teams/notify";
import { audit } from "@/lib/audit";

/**
 * SOP production auto-handoffs. Once a job is customer-approved (no pending
 * proof), push the production files to the right place automatically:
 *   • Embroidery  → digitizer
 *   • Silkscreen  → shop (only once separations are marked complete)
 * Idempotent: each channel fires at most once (guarded on the *SentAt columns),
 * so it's safe to call from every place the relevant state can change.
 * Returns the channels that fired this call (for optional UI messaging).
 */
export async function runArtHandoffAutomation(requestId: string, actorId?: string | null): Promise<string[]> {
  const req = await db.query.artRequests.findFirst({ where: eq(artRequests.id, requestId) });
  if (!req) return [];

  const proofs = await db.select({ status: orderProofs.status }).from(orderProofs).where(eq(orderProofs.orderId, req.orderId));
  const approved = proofs.some((p) => p.status === "approved") || req.status === "approved" || req.status === "done";
  const pending = proofs.some((p) => p.status === "pending");
  if (!approved || pending) return [];

  const order = await db.query.orders.findFirst({ where: eq(orders.id, req.orderId), columns: { orderNumber: true } });
  const ord = order?.orderNumber ?? "";
  const fired: string[] = [];

  if (req.productionType === "embroidery" && !req.digitizerSentAt) {
    await db.update(artRequests).set({ digitizerSentAt: new Date(), updatedAt: new Date() }).where(eq(artRequests.id, req.id));
    await notifyTeam("production", {
      type: "production",
      title: "Embroidery auto-sent to digitizer",
      body: `Order ${ord} was approved — production files auto-sent to the digitizer${req.stitchCount ? ` · ${req.stitchCount.toLocaleString()} stitches` : ""}.`,
      link: `/art/${req.id}`,
    }, ["production"]);
    await audit({ userId: actorId ?? null, action: "art.auto_digitizer_sent", entityType: "art_request", entityId: req.id });
    fired.push("digitizer");
  }

  if (req.productionType === "screen_print" && req.separationsDone && !req.separationsSentAt) {
    await db.update(artRequests).set({ separationsSentAt: new Date(), updatedAt: new Date() }).where(eq(artRequests.id, req.id));
    await notifyTeam("production", {
      type: "production",
      title: "Separations auto-sent to silkscreen",
      body: `Order ${ord} was approved with separations complete — auto-sent to the silkscreen department.`,
      link: `/art/${req.id}`,
    }, ["production"]);
    await audit({ userId: actorId ?? null, action: "art.auto_seps_sent", entityType: "art_request", entityId: req.id });
    fired.push("separations");
  }

  return fired;
}
