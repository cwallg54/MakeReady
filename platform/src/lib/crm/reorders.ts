import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Proactive reorder / retention engine.
 *
 * A customer's buying history (SAP `historical_orders` + live `orders`) reveals
 * a natural cadence — a print shop's accounts reorder shirts, banners, etc. on a
 * rhythm. When an account is overdue against its own average interval it's a
 * warm retention opportunity: reach out before they drift to a competitor.
 *
 * We compute, per business partner, the order count, first/last order date,
 * lifetime spend and the average gap between orders, then flag the accounts that
 * are past due for their next order.
 */

export interface ReorderCandidate {
  bpId: string;
  bpNumber: string;
  company: string;
  ownerId: string | null;
  ownerName: string | null;
  email: string | null;
  phone: string | null;
  orders: number;
  firstOrder: Date;
  lastOrder: Date;
  lifetime: number;
  avgIntervalDays: number; // typical gap between orders
  daysSinceLast: number;
  expectedNext: Date; // lastOrder + avgInterval
  daysOverdue: number; // daysSinceLast - avgInterval (>0 means past due)
  overdueRatio: number; // daysSinceLast / avgInterval (1 = right on cadence)
}

interface Opts {
  /** Only accounts with at least this many orders (need history for a reliable cadence). */
  minOrders?: number;
  /** Ignore very slow cadences (one-off / annual+ buyers create noise). */
  maxAvgIntervalDays?: number;
  /** Only surface accounts at least this overdue (1 = at/after expected reorder date). */
  minOverdueRatio?: number;
  /** Drop accounts gone quiet for this long — churned, not a reorder nudge. */
  maxDaysSinceLast?: number;
  limit?: number;
}

export async function reorderCandidates(opts: Opts = {}): Promise<ReorderCandidate[]> {
  const minOrders = opts.minOrders ?? 3;
  const maxAvgIntervalDays = opts.maxAvgIntervalDays ?? 400;
  const minOverdueRatio = opts.minOverdueRatio ?? 1.15;
  const maxDaysSinceLast = opts.maxDaysSinceLast ?? 540;
  const limit = opts.limit ?? 100;

  // Union historical (SAP) + live orders into one event stream, aggregate per BP.
  const rows = await db.execute(sql`
    with ev as (
      select bp_id, doc_date as d, coalesce(doc_total, 0)::numeric as amt
        from historical_orders where canceled = false
      union all
      select bp_id, created_at as d, coalesce(amount, 0)::numeric as amt
        from orders where bp_id is not null and voided_at is null
    ),
    agg as (
      select bp_id,
             count(*)::int as orders,
             min(d) as first_order,
             max(d) as last_order,
             sum(amt) as lifetime
        from ev
       group by bp_id
      having count(*) >= ${minOrders}
    )
    select a.bp_id, a.orders, a.first_order, a.last_order, a.lifetime,
           bp.bp_number, bp.company_name, bp.owner_id, bp.email, bp.phone,
           u.name as owner_name
      from agg a
      join business_partners bp on bp.id = a.bp_id
      left join users u on u.id = bp.owner_id
     where bp.credit_hold = false
  `);

  const now = Date.now();
  const DAY = 86_400_000;

  const candidates: ReorderCandidate[] = [];
  for (const r of rows.rows as Record<string, unknown>[]) {
    const orders = Number(r.orders);
    const firstOrder = new Date(r.first_order as string);
    const lastOrder = new Date(r.last_order as string);
    const spanDays = (lastOrder.getTime() - firstOrder.getTime()) / DAY;
    if (spanDays <= 0) continue;
    const avgIntervalDays = spanDays / (orders - 1);
    if (avgIntervalDays > maxAvgIntervalDays) continue;

    const daysSinceLast = (now - lastOrder.getTime()) / DAY;
    if (daysSinceLast > maxDaysSinceLast) continue; // churned, not a nudge
    const overdueRatio = daysSinceLast / avgIntervalDays;
    if (overdueRatio < minOverdueRatio) continue;

    candidates.push({
      bpId: r.bp_id as string,
      bpNumber: r.bp_number as string,
      company: r.company_name as string,
      ownerId: (r.owner_id as string) ?? null,
      ownerName: (r.owner_name as string) ?? null,
      email: (r.email as string) ?? null,
      phone: (r.phone as string) ?? null,
      orders,
      firstOrder,
      lastOrder,
      lifetime: Number(r.lifetime),
      avgIntervalDays,
      daysSinceLast,
      expectedNext: new Date(lastOrder.getTime() + avgIntervalDays * DAY),
      daysOverdue: daysSinceLast - avgIntervalDays,
      overdueRatio,
    });
  }

  // Rank by how overdue AND how valuable — biggest at-risk revenue first.
  candidates.sort((a, b) => b.overdueRatio * Math.log10(b.lifetime + 10) - a.overdueRatio * Math.log10(a.lifetime + 10));
  return candidates.slice(0, limit);
}
