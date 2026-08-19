import "server-only";
import { desc, eq, gte, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { qualityInspections, qualityDefects, orders, businessPartners, users } from "@/db/schema";

export async function listInspections(limit = 200) {
  return db
    .select({
      id: qualityInspections.id, inspectionNumber: qualityInspections.inspectionNumber,
      stage: qualityInspections.stage, result: qualityInspections.result,
      qtyInspected: qualityInspections.qtyInspected, qtyRejected: qualityInspections.qtyRejected,
      createdAt: qualityInspections.createdAt, orderNumber: orders.orderNumber, jobId: qualityInspections.jobId,
      customer: businessPartners.companyName, inspector: users.name,
    })
    .from(qualityInspections)
    .leftJoin(orders, eq(orders.id, qualityInspections.orderId))
    .leftJoin(businessPartners, eq(businessPartners.id, orders.bpId))
    .leftJoin(users, eq(users.id, qualityInspections.inspectorId))
    .orderBy(desc(qualityInspections.createdAt))
    .limit(limit);
}

export async function qualitySummary() {
  const from = DateTime.now().minus({ days: 30 }).toJSDate();
  const rows = await db
    .select({ result: qualityInspections.result, n: sql<string>`COUNT(*)`, inspected: sql<string>`COALESCE(SUM(${qualityInspections.qtyInspected}),0)`, rejected: sql<string>`COALESCE(SUM(${qualityInspections.qtyRejected}),0)` })
    .from(qualityInspections)
    .where(gte(qualityInspections.createdAt, from))
    .groupBy(qualityInspections.result);
  let total = 0, fail = 0, inspected = 0, rejected = 0;
  for (const r of rows) {
    const n = Number(r.n);
    total += n;
    if (r.result === "fail") fail += n;
    inspected += Number(r.inspected);
    rejected += Number(r.rejected);
  }
  const passRate = total ? (total - fail) / total : 1;
  const defectRate = inspected ? rejected / inspected : 0;
  return { total, fail, passRate, defectRate, inspected, rejected };
}

export async function getInspection(id: string) {
  const insp = await db.query.qualityInspections.findFirst({ where: eq(qualityInspections.id, id) });
  if (!insp) return null;
  const defects = await db.select().from(qualityDefects).where(eq(qualityDefects.inspectionId, id)).orderBy(qualityDefects.defectType);
  const order = insp.orderId ? await db.query.orders.findFirst({ where: eq(orders.id, insp.orderId), columns: { orderNumber: true } }) : null;
  return { insp, defects, order };
}

/** Open production jobs to pick from when starting an inspection. */
export async function jobsForInspection() {
  const { productionJobs } = await import("@/db/schema");
  return db
    .select({ id: productionJobs.id, orderNumber: orders.orderNumber, status: productionJobs.status, customer: businessPartners.companyName })
    .from(productionJobs)
    .leftJoin(orders, eq(orders.id, productionJobs.orderId))
    .leftJoin(businessPartners, eq(businessPartners.id, orders.bpId))
    .orderBy(desc(productionJobs.createdAt))
    .limit(300);
}

export async function inspectionsForJob(jobId: string) {
  return db.select().from(qualityInspections).where(eq(qualityInspections.jobId, jobId)).orderBy(desc(qualityInspections.createdAt));
}
