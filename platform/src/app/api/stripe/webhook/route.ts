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
    const amountCents = Number(s.amount_total ?? 0);
    if (invoiceId && s.payment_status === "paid" && amountCents > 0) {
      await recordInvoiceCardPayment({ invoiceId, amountCents, reference: `stripe:${s.id}` });
    }
  }

  return new Response("ok", { status: 200 });
}
