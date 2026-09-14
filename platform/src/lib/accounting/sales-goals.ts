import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { historicalOrders, orders, salesGoals, salesReps, users } from "@/db/schema";
import { buildFiscalYear, fiscalYearOf, type PeriodSpec } from "./fiscal";
import { fiscalStartMonth } from "./fiscal-service";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface GoalCell {
  code: string; // period code, e.g. "2026-03"
  label: string; // "Dec 2025"
  year: number;
  month: number;
  goal: number;
  actual: number;
  attainment: number | null; // % of goal
  elapsed: boolean; // the month has finished (or is the current one)
}

export interface RepGoalRow {
  repId: string;
  code: string;
  name: string;
  active: boolean;
  userId: string | null;
  cells: GoalCell[];
  goalTotal: number;
  actualTotal: number;
  attainment: number | null;
  /** Goal for the months that have actually happened — the fair comparison. */
  goalToDate: number;
  attainmentToDate: number | null;
}

export interface GoalsVsActual {
  fiscalYear: number;
  periods: PeriodSpec[];
  reps: RepGoalRow[];
  totals: RepGoalRow;
  asOf: string;
}

/** Goal versus actual by rep, by month, across one fiscal year.
 *
 *  Actuals come from the order history (which carries the rep the legacy ERP
 *  credited) plus orders raised in the platform (credited through the rep's
 *  linked user account), so the two sources never double-count the same order. */
export async function goalsVsActual(fiscalYear?: number, asOfDate = new Date()): Promise<GoalsVsActual> {
  const startMonth = await fiscalStartMonth();
  const asOf = asOfDate.toISOString().slice(0, 10);
  const fy = fiscalYear ?? fiscalYearOf(asOf, startMonth);
  const spec = buildFiscalYear(fy, startMonth);
  const from = new Date(`${spec.startDate}T00:00:00`);
  const to = new Date(`${spec.endDate}T23:59:59`);

  const reps = await db.select().from(salesReps).orderBy(asc(salesReps.name));

  // Goals for every calendar month the fiscal year touches.
  const goalRows = await db
    .select({ repId: salesGoals.repId, year: salesGoals.year, month: salesGoals.month, amount: salesGoals.amount })
    .from(salesGoals)
    .where(sql`(${salesGoals.year} * 100 + ${salesGoals.month}) between ${Number(spec.periods[0].startDate.slice(0, 4)) * 100 + Number(spec.periods[0].startDate.slice(5, 7))} and ${Number(spec.periods[11].startDate.slice(0, 4)) * 100 + Number(spec.periods[11].startDate.slice(5, 7))}`);
  const goalBy = new Map(goalRows.map((g) => [`${g.repId}|${g.year}-${g.month}`, Number(g.amount)]));

  // Actuals from the migrated history.
  const histRows = await db
    .select({
      repId: historicalOrders.repId,
      y: sql<string>`EXTRACT(YEAR FROM ${historicalOrders.docDate})`,
      m: sql<string>`EXTRACT(MONTH FROM ${historicalOrders.docDate})`,
      total: sql<string>`COALESCE(SUM(${historicalOrders.docTotal}), 0)`,
    })
    .from(historicalOrders)
    .where(and(gte(historicalOrders.docDate, from), lte(historicalOrders.docDate, to), eq(historicalOrders.canceled, false)))
    .groupBy(historicalOrders.repId, sql`EXTRACT(YEAR FROM ${historicalOrders.docDate})`, sql`EXTRACT(MONTH FROM ${historicalOrders.docDate})`);

  const actualBy = new Map<string, number>();
  for (const r of histRows) {
    if (!r.repId) continue;
    const key = `${r.repId}|${Number(r.y)}-${Number(r.m)}`;
    actualBy.set(key, round2((actualBy.get(key) ?? 0) + Number(r.total)));
  }

  // Actuals from orders raised in the platform, credited via the rep's user.
  const repByUser = new Map(reps.filter((r) => r.userId).map((r) => [r.userId as string, r.id]));
  if (repByUser.size) {
    const liveRows = await db
      .select({
        userId: orders.salesRepId,
        y: sql<string>`EXTRACT(YEAR FROM ${orders.createdAt})`,
        m: sql<string>`EXTRACT(MONTH FROM ${orders.createdAt})`,
        total: sql<string>`COALESCE(SUM(${orders.amount}), 0)`,
      })
      .from(orders)
      .where(and(gte(orders.createdAt, from), lte(orders.createdAt, to), sql`${orders.voidedAt} IS NULL`))
      .groupBy(orders.salesRepId, sql`EXTRACT(YEAR FROM ${orders.createdAt})`, sql`EXTRACT(MONTH FROM ${orders.createdAt})`);
    for (const r of liveRows) {
      const repId = r.userId ? repByUser.get(r.userId) : null;
      if (!repId) continue;
      const key = `${repId}|${Number(r.y)}-${Number(r.m)}`;
      actualBy.set(key, round2((actualBy.get(key) ?? 0) + Number(r.total)));
    }
  }

  const build = (repId: string | null, rep?: (typeof reps)[number]): RepGoalRow => {
    const cells: GoalCell[] = spec.periods.map((p) => {
      const year = Number(p.startDate.slice(0, 4));
      const month = Number(p.startDate.slice(5, 7));
      const key = repId ? `${repId}|${year}-${month}` : "";
      const goal = repId ? goalBy.get(key) ?? 0 : 0;
      const actual = repId ? actualBy.get(key) ?? 0 : 0;
      return {
        code: p.code,
        label: p.name,
        year,
        month,
        goal,
        actual,
        attainment: goal > 0 ? round2((actual / goal) * 100) : null,
        elapsed: p.startDate <= asOf,
      };
    });
    const goalTotal = round2(cells.reduce((s, c) => s + c.goal, 0));
    const actualTotal = round2(cells.reduce((s, c) => s + c.actual, 0));
    const goalToDate = round2(cells.filter((c) => c.elapsed).reduce((s, c) => s + c.goal, 0));
    return {
      repId: repId ?? "",
      code: rep?.code ?? "",
      name: rep?.name ?? "Total",
      active: rep?.active ?? true,
      userId: rep?.userId ?? null,
      cells,
      goalTotal,
      actualTotal,
      attainment: goalTotal > 0 ? round2((actualTotal / goalTotal) * 100) : null,
      goalToDate,
      attainmentToDate: goalToDate > 0 ? round2((actualTotal / goalToDate) * 100) : null,
    };
  };

  const rows = reps
    .map((r) => build(r.id, r))
    .filter((r) => r.goalTotal > 0 || r.actualTotal > 0)
    .sort((a, b) => b.actualTotal - a.actualTotal);

  // Totals are summed from the rows, so they always agree with what is shown.
  const totals = build(null);
  totals.cells = totals.cells.map((c, i) => {
    const goal = round2(rows.reduce((s, r) => s + r.cells[i].goal, 0));
    const actual = round2(rows.reduce((s, r) => s + r.cells[i].actual, 0));
    return { ...c, goal, actual, attainment: goal > 0 ? round2((actual / goal) * 100) : null };
  });
  totals.goalTotal = round2(rows.reduce((s, r) => s + r.goalTotal, 0));
  totals.actualTotal = round2(rows.reduce((s, r) => s + r.actualTotal, 0));
  totals.goalToDate = round2(rows.reduce((s, r) => s + r.goalToDate, 0));
  totals.attainment = totals.goalTotal > 0 ? round2((totals.actualTotal / totals.goalTotal) * 100) : null;
  totals.attainmentToDate = totals.goalToDate > 0 ? round2((totals.actualTotal / totals.goalToDate) * 100) : null;

  return { fiscalYear: fy, periods: spec.periods, reps: rows, totals, asOf };
}

/** Reps with their linked user, for the goal-editing screen. */
export async function repsForEditing() {
  return db
    .select({
      id: salesReps.id,
      code: salesReps.code,
      name: salesReps.name,
      active: salesReps.active,
      userId: salesReps.userId,
      userName: users.name,
    })
    .from(salesReps)
    .leftJoin(users, eq(users.id, salesReps.userId))
    .orderBy(asc(salesReps.name));
}

/** Set one rep's goal for one calendar month. Zero clears it. */
export async function setGoal(repId: string, year: number, month: number, amount: number, userId: string): Promise<void> {
  const value = round2(Math.max(0, amount));
  if (value <= 0) {
    await db.delete(salesGoals).where(and(eq(salesGoals.repId, repId), eq(salesGoals.year, year), eq(salesGoals.month, month)));
    return;
  }
  await db
    .insert(salesGoals)
    .values({ repId, year, month, amount: value.toFixed(2), updatedBy: userId })
    .onConflictDoUpdate({
      target: [salesGoals.repId, salesGoals.year, salesGoals.month],
      set: { amount: value.toFixed(2), updatedBy: userId, updatedAt: new Date() },
    });
}
