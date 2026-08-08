import "server-only";
import { accountTotals, type TrialBalanceRow } from "./journal";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface StatementLine { id: string; code: string; name: string; amount: number }
export interface StatementGroup { label: string | null; lines: StatementLine[]; total: number }

const toLines = (rows: TrialBalanceRow[]): StatementLine[] =>
  rows.filter((r) => r.balance !== 0).map((r) => ({ id: r.id, code: r.code, name: r.name, amount: round2(r.balance) }));
const sum = (rows: TrialBalanceRow[]) => round2(rows.reduce((s, r) => s + r.balance, 0));

/** Group rows by their subtype (preserving code order), skipping empty groups. */
function groupBySubtype(rows: TrialBalanceRow[]): StatementGroup[] {
  const order: string[] = [];
  const map = new Map<string, TrialBalanceRow[]>();
  for (const r of rows) {
    const key = r.subtype || "Other";
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(r);
  }
  return order
    .map((label) => ({ label, lines: toLines(map.get(label)!), total: sum(map.get(label)!) }))
    .filter((g) => g.lines.length > 0);
}

// ---- Income statement (P&L) -----------------------------------------------

export interface IncomeStatement {
  revenue: StatementGroup;
  cogs: StatementGroup;
  grossProfit: number;
  operating: StatementGroup;
  operatingIncome: number;
  netIncome: number;
}

export async function incomeStatement(from: Date, to: Date): Promise<IncomeStatement> {
  const totals = await accountTotals({ from, to });
  const rev = totals.filter((r) => r.type === "revenue");
  const cogsRows = totals.filter((r) => r.type === "expense" && (r.subtype ?? "").toUpperCase() === "COGS");
  const opRows = totals.filter((r) => r.type === "expense" && (r.subtype ?? "").toUpperCase() !== "COGS");

  const revenue: StatementGroup = { label: null, lines: toLines(rev), total: sum(rev) };
  const cogs: StatementGroup = { label: null, lines: toLines(cogsRows), total: sum(cogsRows) };
  const operating: StatementGroup = { label: null, lines: toLines(opRows), total: sum(opRows) };
  const grossProfit = round2(revenue.total - cogs.total);
  const operatingIncome = round2(grossProfit - operating.total);
  return { revenue, cogs, grossProfit, operating, operatingIncome, netIncome: operatingIncome };
}

// ---- Balance sheet --------------------------------------------------------

export interface BalanceSheet {
  assets: { groups: StatementGroup[]; total: number };
  liabilities: { groups: StatementGroup[]; total: number };
  equity: StatementGroup;
  totalLiabEquity: number;
  balanced: boolean;
}

export async function balanceSheet(asOf: Date): Promise<BalanceSheet> {
  const totals = await accountTotals({ to: asOf });
  const a = totals.filter((r) => r.type === "asset");
  const l = totals.filter((r) => r.type === "liability");
  const e = totals.filter((r) => r.type === "equity");
  const rev = totals.filter((r) => r.type === "revenue");
  const exp = totals.filter((r) => r.type === "expense");

  // Net income to date rolls into equity. Split it into prior fiscal years
  // (retained earnings) and the current fiscal year (Oct–Sep) — a formal
  // presentation, since MakeReady doesn't post year-end closing entries.
  const earnings = round2(sum(rev) - sum(exp));
  const y = asOf.getUTCFullYear();
  const fyStart = new Date(Date.UTC(asOf.getUTCMonth() >= 9 ? y : y - 1, 9, 1)); // fiscal year starts Oct 1
  const cur = await accountTotals({ from: fyStart, to: asOf });
  const currentEarnings = round2(sum(cur.filter((r) => r.type === "revenue")) - sum(cur.filter((r) => r.type === "expense")));
  const retained = round2(earnings - currentEarnings);
  const equityLines = toLines(e);
  if (retained !== 0) equityLines.push({ id: "retained-earnings", code: "", name: "Retained earnings", amount: retained });
  if (currentEarnings !== 0) equityLines.push({ id: "current-earnings", code: "", name: "Current-year net income", amount: currentEarnings });

  const assetGroups = groupBySubtype(a);
  const liabGroups = groupBySubtype(l);
  const assetsTotal = sum(a);
  const liabTotal = sum(l);
  const equityTotal = round2(sum(e) + earnings);
  const totalLiabEquity = round2(liabTotal + equityTotal);

  return {
    assets: { groups: assetGroups, total: assetsTotal },
    liabilities: { groups: liabGroups, total: liabTotal },
    equity: { label: null, lines: equityLines, total: equityTotal },
    totalLiabEquity,
    balanced: Math.abs(assetsTotal - totalLiabEquity) < 0.005,
  };
}
