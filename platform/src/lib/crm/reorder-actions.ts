"use server";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireModule } from "@/lib/auth/guards";
import { aiComplete } from "@/lib/ai/client";
import { fmtDate } from "@/lib/format";

/**
 * Draft a short, warm reorder / re-engagement email for an account that's overdue
 * against its buying cadence. Drafts only — staff review and send it themselves.
 */
export async function draftReorderOutreachAction(bpId: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  await requireModule("crm");

  const res = await db.execute(sql`
    with ev as (
      select doc_date as d from historical_orders where bp_id = ${bpId} and canceled = false
      union all
      select created_at as d from orders where bp_id = ${bpId} and voided_at is null
    )
    select bp.company_name, bp.email,
           (select count(*)::int from ev) as orders,
           (select max(d) from ev) as last_order,
           (select min(d) from ev) as first_order,
           (select array_agg(distinct order_type) from orders where bp_id = ${bpId} and order_type is not null) as order_types
      from business_partners bp where bp.id = ${bpId}
  `);
  const row = (res.rows as Record<string, unknown>[])[0];
  if (!row) return { ok: false, error: "Account not found." };

  const company = row.company_name as string;
  const lastOrder = row.last_order ? new Date(row.last_order as string) : null;
  const firstOrder = row.first_order ? new Date(row.first_order as string) : null;
  const orders = Number(row.orders ?? 0);
  const DAY = 86_400_000;
  const cadence = lastOrder && firstOrder && orders > 1 ? Math.round((lastOrder.getTime() - firstOrder.getTime()) / DAY / (orders - 1)) : null;
  const types = (row.order_types as string[] | null) ?? [];

  const facts = [
    `Customer: ${company}`,
    lastOrder ? `Last order: ${fmtDate(lastOrder)}` : null,
    `Lifetime orders with us: ${orders}`,
    cadence ? `Typically reorders about every ${cadence} days` : null,
    types.length ? `Usual products: ${types.join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const result = await aiComplete({
    system:
      "You write short, warm B2B re-engagement emails for a commercial print & apparel-decoration shop (Great Mountain West). Tone: friendly, concise, professional — a real sales rep, not marketing spam. No emojis. 90 words max. Return only the email body (a greeting line, 2 short paragraphs, and a sign-off with the placeholder [Your name]). Do not invent order numbers, prices, or dates not given.",
    prompt: `Draft a reorder check-in email to this account. They're overdue for their usual reorder, so gently prompt them to restock and offer to help.\n\n${facts}`,
    maxTokens: 400,
    temperature: 0.6,
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, text: result.text };
}
