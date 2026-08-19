import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { costCenters, costCenterAllocations, jobCosts, productionJobs, orders, businessPartners } from "@/db/schema";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function listCostCenters() {
  return db.select().from(costCenters).orderBy(desc(costCenters.active), costCenters.code);
}

export async function getCostCenter(id: string) {
  const cc = await db.query.costCenters.findFirst({ where: eq(costCenters.id, id) });
  if (!cc) return null;
  const allocations = await db
    .select({ id: costCenterAllocations.id, toCostCenterId: costCenterAllocations.toCostCenterId, pct: costCenterAllocations.pct, toName: costCenters.name, toCode: costCenters.code })
    .from(costCenterAllocations)
    .innerJoin(costCenters, eq(costCenters.id, costCenterAllocations.toCostCenterId))
    .where(eq(costCenterAllocations.fromCostCenterId, id));
  return { cc, allocations };
}

/** Departments available as overhead-allocation targets. */
export async function departments() {
  return db.select().from(costCenters).where(and(eq(costCenters.kind, "department"), eq(costCenters.active, true))).orderBy(costCenters.code);
}

/** Captured cost by cost center for a period (direct, before overhead spread). */
export async function costByCenter(from: Date) {
  const rows = await db
    .select({ id: jobCosts.costCenterId, amount: sql<string>`COALESCE(SUM(${jobCosts.amount}),0)`, minutes: sql<string>`COALESCE(SUM(${jobCosts.minutes}),0)` })
    .from(jobCosts)
    .where(gte(jobCosts.createdAt, from))
    .groupBy(jobCosts.costCenterId);
  const byId = new Map(rows.map((r) => [r.id, { amount: round2(Number(r.amount)), minutes: Number(r.minutes) }]));
  const centers = await listCostCenters();
  const direct = centers.map((c) => ({ ...c, direct: byId.get(c.id)?.amount ?? 0, minutes: byId.get(c.id)?.minutes ?? 0 }));

  // Spread each overhead pool onto departments by its allocation percentages.
  const allocations = await db.select().from(costCenterAllocations);
  const allocated = new Map<string, number>();
  for (const pool of direct.filter((c) => c.kind === "overhead")) {
    const rules = allocations.filter((a) => a.fromCostCenterId === pool.id);
    const totalPct = rules.reduce((s, r) => s + Number(r.pct), 0) || 0;
    for (const r of rules) {
      const share = totalPct > 0 ? (Number(r.pct) / totalPct) * pool.direct : 0;
      allocated.set(r.toCostCenterId, round2((allocated.get(r.toCostCenterId) ?? 0) + share));
    }
  }
  return direct.map((c) => ({ ...c, allocatedIn: c.kind === "department" ? allocated.get(c.id) ?? 0 : 0, fullyBurdened: round2(c.direct + (c.kind === "department" ? allocated.get(c.id) ?? 0 : 0)) }));
}

export interface JobProfit {
  jobId: string; orderId: string | null; orderNumber: string | null; customer: string | null;
  revenue: number; cost: number; margin: number; marginPct: number; status: string;
}

/** Order/job profitability from captured actual costs (revenue = order amount). */
export async function jobProfitability(limit = 100): Promise<JobProfit[]> {
  const rows = await db
    .select({
      jobId: productionJobs.id, status: productionJobs.status,
      orderId: orders.id, orderNumber: orders.orderNumber, amount: orders.amount,
      customer: businessPartners.companyName,
      cost: sql<string>`COALESCE((SELECT SUM(${jobCosts.amount}) FROM ${jobCosts} WHERE ${jobCosts.jobId} = ${productionJobs.id}),0)`,
    })
    .from(productionJobs)
    .leftJoin(orders, eq(orders.id, productionJobs.orderId))
    .leftJoin(businessPartners, eq(businessPartners.id, orders.bpId))
    .orderBy(desc(productionJobs.createdAt))
    .limit(limit);
  return rows.map((r) => {
    const revenue = round2(Number(r.amount ?? 0));
    const cost = round2(Number(r.cost));
    const margin = round2(revenue - cost);
    return { jobId: r.jobId, orderId: r.orderId, orderNumber: r.orderNumber, customer: r.customer, revenue, cost, margin, marginPct: revenue ? margin / revenue : 0, status: r.status };
  });
}

export async function jobCostLines(jobId: string) {
  return db
    .select({ id: jobCosts.id, kind: jobCosts.kind, description: jobCosts.description, minutes: jobCosts.minutes, amount: jobCosts.amount, ccName: costCenters.name, ccCode: costCenters.code })
    .from(jobCosts)
    .leftJoin(costCenters, eq(costCenters.id, jobCosts.costCenterId))
    .where(eq(jobCosts.jobId, jobId))
    .orderBy(jobCosts.createdAt);
}
