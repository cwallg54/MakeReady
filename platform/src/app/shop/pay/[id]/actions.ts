"use server";

import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { createInvoiceCheckout } from "@/lib/payments/stripe";

/** Customer starts paying an invoice — creates a Stripe Checkout Session and
 *  redirects to it. Scoped to the logged-in customer's business partner. */
export async function startInvoicePaymentAction(formData: FormData): Promise<void> {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/shop/login");
  const id = String(formData.get("id") ?? "");
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || !customer.bpId || inv.bpId !== customer.bpId) redirect("/shop/account");

  const paidRow = await db.select({ s: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, id));
  const balanceCents = Math.round((Number(inv.total) - Number(paidRow[0]?.s ?? 0)) * 100);
  if (balanceCents <= 0) redirect("/shop/account");

  const base = process.env.APP_URL ?? "https://makeready.g54.com";
  const url = await createInvoiceCheckout({
    invoiceId: inv.id,
    invoiceNumber: inv.invoiceNumber,
    amountCents: balanceCents,
    customerEmail: customer.email,
    successUrl: `${base}/shop/account?paid=1`,
    cancelUrl: `${base}/shop/pay/${inv.id}`,
  });
  if (!url) redirect(`/shop/pay/${inv.id}?err=unavailable`);
  redirect(url);
}
