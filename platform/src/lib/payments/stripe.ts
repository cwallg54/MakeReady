import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Minimal Stripe client via the REST API (no SDK dependency), matching the
 * app's fetch-based integration style. Card data never touches our servers —
 * the customer pays on Stripe's hosted Checkout. Inert until STRIPE_SECRET_KEY
 * (and STRIPE_WEBHOOK_SECRET for the webhook) are set.
 */
const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Create a hosted Checkout Session to pay an invoice; returns the redirect URL. */
export async function createInvoiceCheckout(o: {
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const b = new URLSearchParams();
  b.set("mode", "payment");
  b.set("success_url", o.successUrl);
  b.set("cancel_url", o.cancelUrl);
  if (o.customerEmail) b.set("customer_email", o.customerEmail);
  b.set("client_reference_id", o.invoiceId);
  b.set("metadata[invoiceId]", o.invoiceId);
  b.set("line_items[0][quantity]", "1");
  b.set("line_items[0][price_data][currency]", "usd");
  b.set("line_items[0][price_data][unit_amount]", String(o.amountCents));
  b.set("line_items[0][price_data][product_data][name]", `Invoice ${o.invoiceNumber}`);
  const res = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: b,
  });
  if (!res.ok) {
    console.error("[stripe] checkout failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return null;
  }
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}

/** Verify a Stripe webhook signature (the `t=…,v1=…` scheme). */
export function verifyStripeSignature(payload: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts: Record<string, string> = {};
  for (const kv of sigHeader.split(",")) {
    const eq = kv.indexOf("=");
    if (eq > 0) parts[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}
