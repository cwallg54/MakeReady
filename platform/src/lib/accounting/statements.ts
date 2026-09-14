import "server-only";
import { accountTotals, segmentTotals, type TrialBalanceRow } from "./journal";

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

export async function incomeStatement(from: Date, to: Date, segmentId?: string): Promise<IncomeStatement> {
  const totals = await accountTotals({ from, to, segmentId });
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

// ---- Segmented P&L --------------------------------------------------------
// Revenue and COGS are read by product line (HG / SG / HW); labour and supplies
// by production department; overhead by function. This builds the matrix: one
// column per segment, the P&L lines down the side.

export interface SegmentColumn {
  segmentId: string | null;
  code: string;
  name: string;
  short: string;
  kind: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  operating: number;
  netIncome: number;
}

export interface SegmentPnl {
  columns: SegmentColumn[];
  total: SegmentColumn;
}

const isCogs = (subtype: string | null) => (subtype ?? "").toUpperCase() === "COGS";

export async function segmentPnl(from: Date, to: Date): Promise<SegmentPnl> {
  const rows = await segmentTotals({ from, to });

  const byKey = new Map<string, SegmentColumn>();
  const blank = (r: (typeof rows)[number]): SegmentColumn => ({
    segmentId: r.segmentId,
    code: r.segmentCode,
    name: r.segmentName,
    short: r.segmentShort || r.segmentName,
    kind: r.kind,
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
    grossMarginPct: null,
    operating: 0,
    netIncome: 0,
  });

  for (const r of rows) {
    const key = r.segmentCode;
    let col = byKey.get(key);
    if (!col) byKey.set(key, (col = blank(r)));
    if (r.type === "revenue") col.revenue = round2(col.revenue + r.balance);
    else if (r.type === "expense" && isCogs(r.subtype)) col.cogs = round2(col.cogs + r.balance);
    else if (r.type === "expense") col.operating = round2(col.operating + r.balance);
  }

  const finish = (c: SegmentColumn) => {
    c.grossProfit = round2(c.revenue - c.cogs);
    c.grossMarginPct = c.revenue !== 0 ? round2((c.grossProfit / c.revenue) * 100) : null;
    c.netIncome = round2(c.grossProfit - c.operating);
    return c;
  };

  const columns = [...byKey.values()]
    .map(finish)
    .filter((c) => c.revenue !== 0 || c.cogs !== 0 || c.operating !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  const total = finish({
    segmentId: null,
    code: "",
    name: "Total",
    short: "Total",
    kind: "total",
    revenue: round2(columns.reduce((s, c) => s + c.revenue, 0)),
    cogs: round2(columns.reduce((s, c) => s + c.cogs, 0)),
    grossProfit: 0,
    grossMarginPct: null,
    operating: round2(columns.reduce((s, c) => s + c.operating, 0)),
    netIncome: 0,
  });

  return { columns, total };
}
