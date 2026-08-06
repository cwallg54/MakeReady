import "server-only";
import { accountTotals, type TrialBalanceRow } from "./journal";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface StatementLine { id: string; code: string; name: string; amount: number }
export interface StatementSection { title: string; lines: StatementLine[]; total: number }

const toLines = (rows: TrialBalanceRow[]) =>
  rows.filter((r) => r.balance !== 0).map((r) => ({ id: r.id, code: r.code, name: r.name, amount: round2(r.balance) }));
const sum = (rows: TrialBalanceRow[]) => round2(rows.reduce((s, r) => s + r.balance, 0));

/** Income statement (P&L) for a period: revenue − expenses = net income. */
export async function incomeStatement(from: Date, to: Date): Promise<{
  revenue: StatementSection; expenses: StatementSection; netIncome: number;
}> {
  const totals = await accountTotals({ from, to });
  const rev = totals.filter((r) => r.type === "revenue");
  const exp = totals.filter((r) => r.type === "expense");
  const revenue: StatementSection = { title: "Revenue", lines: toLines(rev), total: sum(rev) };
  const expenses: StatementSection = { title: "Expenses", lines: toLines(exp), total: sum(exp) };
  return { revenue, expenses, netIncome: round2(revenue.total - expenses.total) };
}

/** Balance sheet as of a date: Assets = Liabilities + Equity (incl. earnings). */
export async function balanceSheet(asOf: Date): Promise<{
  assets: StatementSection; liabilities: StatementSection; equity: StatementSection;
  earnings: number; liabilitiesAndEquity: number; balanced: boolean;
}> {
  const totals = await accountTotals({ to: asOf });
  const a = totals.filter((r) => r.type === "asset");
  const l = totals.filter((r) => r.type === "liability");
  const e = totals.filter((r) => r.type === "equity");
  const rev = totals.filter((r) => r.type === "revenue");
  const exp = totals.filter((r) => r.type === "expense");

  // Net income to date rolls into equity (retained earnings not yet closed).
  const earnings = round2(sum(rev) - sum(exp));
  const assets: StatementSection = { title: "Assets", lines: toLines(a), total: sum(a) };
  const liabilities: StatementSection = { title: "Liabilities", lines: toLines(l), total: sum(l) };
  const equityLines = toLines(e);
  if (earnings !== 0) equityLines.push({ id: "current-earnings", code: "", name: "Current-period net income", amount: earnings });
  const equity: StatementSection = { title: "Equity", lines: equityLines, total: round2(sum(e) + earnings) };

  const liabilitiesAndEquity = round2(liabilities.total + equity.total);
  return { assets, liabilities, equity, earnings, liabilitiesAndEquity, balanced: Math.abs(assets.total - liabilitiesAndEquity) < 0.005 };
}
