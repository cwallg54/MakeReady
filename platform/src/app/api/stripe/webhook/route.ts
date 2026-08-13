import type { NextRequest } from "next/server";
import { verifyStripeSignature } from "@/lib/payments/stripe";
import { recordInvoiceCardPayment } from "@/lib/payments/record";

export const dynamic = "force-dynamic";

/** Stripe webhook — records a completed invoice payment against AR/GL.
 *  Inert until STRIPE_WEBHOOK_SECRET is set. */
export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = await req.text();
  if (!secret || !verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return new Response("invalid signature", { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data?.object ?? {};
    const meta = (s.metadata ?? {}) as Record<string, string>;
    const invoiceId = meta.invoiceId || (s.client_reference_id as string | undefined);
    const chargedCents = Number(s.amount_total ?? 0);
    // Book the AR-settling amount (excludes any card surcharge); the surcharge is
    // recorded as a note only. Falls back to the charged total for older sessions.
    const arCents = Number(meta.arCents ?? chargedCents) || chargedCents;
    const method = meta.method === "ach" ? "ach" : "card";
    const feeCents = Math.max(0, chargedCents - arCents);
    if (invoiceId && s.payment_status === "paid" && arCents > 0) {
      await recordInvoiceCardPayment({ invoiceId, amountCents: arCents, reference: `stripe:${s.id}`, method, feeCents });
    }
  }

  return new Response("ok", { status: 200 });
}
