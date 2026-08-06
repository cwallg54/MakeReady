import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { glAccounts, journalEntries, journalLines } from "@/db/schema";

const round2 = (n: number) => Math.round(n * 100) / 100;

type Category = "operating" | "investing" | "financing";

/** Classify a counter-account into a cash-flow activity. Accumulated
 *  depreciation nets against depreciation expense in operating (non-cash). */
function classify(type: string, subtype: string | null, name: string): Category {
  const n = name.toLowerCase();
  const st = (subtype ?? "").toLowerCase();
  if (n.includes("accumulated depreciation")) return "operating";
  if (type === "revenue" || type === "expense") return "operating";
  if (type === "asset") return st.includes("fixed") ? "investing" : "operating";
  if (type === "liability") return /loan|line of credit|note payable|long[- ]?term/.test(n) ? "financing" : "operating";
  if (type === "equity") return "financing";
  return "operating";
}

export interface CashFlowLine { name: string; amount: number } // +inflow / −outflow
export interface CashFlowSection { title: string; lines: CashFlowLine[]; total: number }
export interface CashFlow {
  operating: CashFlowSection;
  investing: CashFlowSection;
  financing: CashFlowSection;
  netChange: number;
  beginning: number;
  ending: number;
}

const CAT_TITLE: Record<Category, string> = { operating: "Operating Activities", investing: "Investing Activities", financing: "Financing Activities" };

export async function cashFlow(from: Date, to: Date): Promise<CashFlow> {
  const cash = await db.query.glAccounts.findFirst({ where: eq(glAccounts.systemKey, "cash"), columns: { id: true } });
  const empty = (t: Category): CashFlowSection => ({ title: CAT_TITLE[t], lines: [], total: 0 });
  if (!cash) return { operating: empty("operating"), investing: empty("investing"), financing: empty("financing"), netChange: 0, beginning: 0, ending: 0 };

  // Posted entries in the period that touch cash.
  const entryRows = await db
    .selectDistinct({ id: journalLines.entryId })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(eq(journalLines.accountId, cash.id), eq(journalEntries.status, "posted"), sql`${journalEntries.date} >= ${from}`, sql`${journalEntries.date} <= ${to}`));
  const entryIds = entryRows.map((r) => r.id);

  // Beginning cash = cash balance strictly before the period (debit-normal).
  const [beg] = await db
    .select({ d: sql<string>`COALESCE(SUM(${journalLines.debit}),0)`, c: sql<string>`COALESCE(SUM(${journalLines.credit}),0)` })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(eq(journalLines.accountId, cash.id), eq(journalEntries.status, "posted"), lt(journalEntries.date, from)));
  const beginning = round2(Number(beg?.d ?? 0) - Number(beg?.c ?? 0));

  const cats: Record<Category, Map<string, number>> = { operating: new Map(), investing: new Map(), financing: new Map() };
  if (entryIds.length) {
    const rows = await db
      .select({ name: glAccounts.name, type: glAccounts.type, subtype: glAccounts.subtype, debit: journalLines.debit, credit: journalLines.credit })
      .from(journalLines)
      .innerJoin(glAccounts, eq(glAccounts.id, journalLines.accountId))
      .where(and(inArray(journalLines.entryId, entryIds), sql`${journalLines.accountId} <> ${cash.id}`));
    for (const r of rows) {
      const contribution = Number(r.credit) - Number(r.debit); // cash effect of this counter-line
      if (contribution === 0) continue;
      const cat = classify(r.type, r.subtype, r.name);
      cats[cat].set(r.name, round2((cats[cat].get(r.name) ?? 0) + contribution));
    }
  }

  const section = (t: Category): CashFlowSection => {
    const lines = [...cats[t].entries()].filter(([, v]) => v !== 0).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
    return { title: CAT_TITLE[t], lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) };
  };
  const operating = section("operating"), investing = section("investing"), financing = section("financing");
  const netChange = round2(operating.total + investing.total + financing.total);
  return { operating, investing, financing, netChange, beginning, ending: round2(beginning + netChange) };
}
