"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, businessPartners, contacts } from "@/db/schema";
import { createInvoiceCheckout, type PayMethod } from "@/lib/payments/stripe";
import { consumeRateLimit, clientIp } from "@/lib/security/rate-limit";

const APP = () => process.env.APP_URL ?? "https://makeready.g54.com";

/** Balance (in cents) still owed on an invoice. */
async function balanceCents(invoiceId: string, total: string): Promise<number> {
  const paid = await db.select({ s: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, invoiceId));
  return Math.round((Number(total) - Number(paid[0]?.s ?? 0)) * 100);
}

/** Card surcharge percent from settings (0 = none). */
export async function cardSurchargePct(): Promise<number> {
  const s = await db.query.systemSettings.findFirst({ columns: { cardSurchargePct: true } });
  return Number(s?.cardSurchargePct ?? 0);
}

/** Public: start paying an invoice by the chosen method. Token is the auth. */
export async function payInvoiceAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const method: PayMethod = String(formData.get("method") ?? "card") === "ach" ? "ach" : "card";
  if (!token) return;
  const rl = await consumeRateLimit("invoice-pay", await clientIp(), 20, 600);
  if (!rl.ok) redirect(`/invoice/${token}?err=busy`);

  const inv = await db.query.invoices.findFirst({ where: eq(invoices.publicToken, token) });
  if (!inv || inv.voidedAt || inv.status === "void") redirect(`/invoice/${token}`);

  const ar = await balanceCents(inv.id, inv.total);
  if (ar <= 0) redirect(`/invoice/${token}?paid=1`);

  // Card carries the processing surcharge; ACH/bank does not.
  const pct = method === "card" ? await cardSurchargePct() : 0;
  const feeCents = pct > 0 ? Math.round(ar * (pct / 100)) : 0;
  const amountCents = ar + feeCents;

  // Best-effort customer email for the receipt.
  let email: string | undefined;
  if (inv.bpId) {
    const [c, bp] = await Promise.all([
      db.query.contacts.findFirst({ where: eq(contacts.bpId, inv.bpId), columns: { email: true } }),
      db.query.businessPartners.findFirst({ where: eq(businessPartners.id, inv.bpId), columns: { email: true } }),
    ]);
    email = (c?.email ?? bp?.email ?? "").trim() || undefined;
  }

  const url = await createInvoiceCheckout({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    amountCents,
    arCents: ar,
    method,
    customerEmail: email,
    successUrl: `${APP()}/invoice/${token}?paid=1`,
    cancelUrl: `${APP()}/invoice/${token}`,
  });
  if (!url) redirect(`/invoice/${token}?err=unavailable`);
  redirect(url);
}
