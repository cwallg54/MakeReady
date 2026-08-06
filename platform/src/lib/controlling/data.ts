import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { historicalOrders, businessPartners, users, glAccounts, budgets } from "@/db/schema";
import { incomeStatement } from "@/lib/accounting/statements";
import { accountTotals } from "@/lib/accounting/journal";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Company margins from the GL income statement for a period. */
export async function companyMargins(from: Date, to: Date) {
  const is = await incomeStatement(from, to);
  const revenue = is.revenue.total;
  return {
    revenue,
    cogs: is.cogs.total,
    grossProfit: is.grossProfit,
    grossMarginPct: revenue ? is.grossProfit / revenue : 0,
    operating: is.operating.total,
    netIncome: is.netIncome,
    netMarginPct: revenue ? is.netIncome / revenue : 0,
  };
}

export interface ProfitRow { id: string; name: string; revenue: number; grossProfit: number; marginPct: number }

/** Revenue by customer for the period (from SAP order history), with estimated
 *  gross profit at the company gross-margin rate. */
export async function profitByCustomer(from: Date, grossMarginPct: number, limit = 25): Promise<ProfitRow[]> {
  const rows = await db
    .select({ id: historicalOrders.bpId, name: businessPartners.companyName, rev: sql<string>`COALESCE(SUM(${historicalOrders.docTotal}),0)` })
    .from(historicalOrders).innerJoin(businessPartners, eq(businessPartners.id, historicalOrders.bpId))
    .where(and(eq(historicalOrders.canceled, false), gte(historicalOrders.docDate, from)))
    .groupBy(historicalOrders.bpId, businessPartners.companyName)
    .orderBy(desc(sql`SUM(${historicalOrders.docTotal})`))
    .limit(limit);
  return rows.map((r) => {
    const revenue = round2(Number(r.rev));
    const grossProfit = round2(revenue * grossMarginPct);
    return { id: r.id ?? "none", name: r.name ?? "—", revenue, grossProfit, marginPct: grossMarginPct };
  });
}

/** Revenue by salesperson (the account owner) for the period. */
export async function profitBySalesperson(from: Date, grossMarginPct: number): Promise<ProfitRow[]> {
  const rows = await db
    .select({ ownerId: businessPartners.ownerId, rev: sql<string>`COALESCE(SUM(${historicalOrders.docTotal}),0)` })
    .from(historicalOrders).innerJoin(businessPartners, eq(businessPartners.id, historicalOrders.bpId))
    .where(and(eq(historicalOrders.canceled, false), gte(historicalOrders.docDate, from)))
    .groupBy(businessPartners.ownerId);
  const ownerIds = rows.map((r) => r.ownerId).filter((x): x is string => !!x);
  const names = ownerIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ownerIds)) : [];
  const nameBy = new Map(names.map((u) => [u.id, u.name]));
  return rows
    .map((r) => {
      const revenue = round2(Number(r.rev));
      return { id: r.ownerId ?? "unassigned", name: r.ownerId ? (nameBy.get(r.ownerId) ?? "—") : "Unassigned", revenue, grossProfit: round2(revenue * grossMarginPct), marginPct: grossMarginPct };
    })
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

export interface BudgetRow { accountId: string; code: string; name: string; type: string; budget: number; actual: number; variance: number }

/** Budget vs actual for revenue & expense accounts in a period/year. */
export async function budgetVsActual(year: number, from: Date, to: Date): Promise<BudgetRow[]> {
  const totals = await accountTotals({ from, to });
  const pl = totals.filter((r) => r.type === "revenue" || r.type === "expense");
  const budgetRows = await db.select().from(budgets).where(eq(budgets.fiscalYear, year));
  const budgetBy = new Map(budgetRows.map((b) => [b.accountId, Number(b.amount)]));
  return pl.map((r) => {
    const budget = budgetBy.get(r.id) ?? 0;
    const actual = r.balance; // normal-side balance (revenue credit, expense debit)
    // Variance favourable when revenue beats budget or expense stays under.
    const variance = r.type === "revenue" ? round2(actual - budget) : round2(budget - actual);
    return { accountId: r.id, code: r.code, name: r.name, type: r.type, budget: round2(budget), actual: round2(actual), variance };
  }).sort((a, b) => a.code.localeCompare(b.code));
}

/** All P&L accounts (for the budget entry form), with the current budget. */
export async function plAccountsWithBudget(year: number) {
  const accts = await db.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name, type: glAccounts.type })
    .from(glAccounts).where(and(eq(glAccounts.active, true), inArray(glAccounts.type, ["revenue", "expense"]))).orderBy(asc(glAccounts.code));
  const budgetRows = await db.select().from(budgets).where(eq(budgets.fiscalYear, year));
  const budgetBy = new Map(budgetRows.map((b) => [b.accountId, Number(b.amount)]));
  return accts.map((a) => ({ ...a, budget: budgetBy.get(a.id) ?? 0 }));
}
