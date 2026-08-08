import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, invoices, users, userRoles } from "@/db/schema";
import { postPaymentToGl } from "@/lib/accounting/gl-post";
import { refreshInvoice } from "@/lib/accounting/ar";

/**
 * Record a customer's online card payment against an invoice — same path a
 * staff-entered payment takes (payment row → GL post Dr Cash/Cr AR → refresh
 * invoice status). Idempotent on the Stripe reference so webhook retries are
 * safe. Attributed to an admin actor for the GL entry.
 */
export async function recordInvoiceCardPayment(o: { invoiceId: string; amountCents: number; reference: string }): Promise<void> {
  const existing = await db.query.payments.findFirst({ where: eq(payments.reference, o.reference), columns: { id: true } });
  if (existing) return; // already recorded

  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, o.invoiceId), columns: { id: true, bpId: true } });
  if (!inv) return;

  const admin = await db.select({ id: users.id }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).where(eq(userRoles.role, "admin")).limit(1);
  const actorId = admin[0]?.id ?? null;

  const [pay] = await db.insert(payments).values({
    invoiceId: inv.id,
    bpId: inv.bpId,
    amount: (o.amountCents / 100).toFixed(2),
    method: "card",
    reference: o.reference,
    receivedDate: new Date(),
    notes: "Online payment (Stripe)",
    createdBy: actorId,
  }).returning({ id: payments.id });

  if (actorId) await postPaymentToGl(pay.id, actorId);
  await refreshInvoice(inv.id);
}
