/**
 * Populate the general ledger with REAL data from the migrated SAP backup.
 *
 * Idempotent: deletes any prior source='backfill' entries first, then posts
 *   1) an opening balance (real inventory valuation) as of the fiscal-year start
 *   2) monthly Sales revenue for the current fiscal year (Oct→present) from
 *      historical_orders (non-canceled): Dr Cash / Cr Sales Revenue.
 *
 * Scope note: only the current fiscal year is posted as cash sales. The SAP
 * backup is sales-side only (no expenses/COGS/cash-outflows), so posting all
 * 19 years would inflate cash/equity unrealistically. Revenue is real; there is
 * no fabricated expense data.
 *
 * Run:  npx tsx --env-file=.env.local scripts/seed-gl-from-history.ts
 */
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

const FY_START = "2025-10-01"; // Great Mountain West fiscal year runs Oct–Sep
const NOW = new Date();

async function acctId(systemKey: string): Promise<string | null> {
  const r = (await sql`select id from gl_accounts where system_key = ${systemKey} and active = true`) as { id: string }[];
  return r[0]?.id ?? null;
}

async function ensureOpeningEquity(): Promise<string> {
  const existing = await acctId("opening_equity");
  if (existing) return existing;
  const [row] = (await sql`
    insert into gl_accounts (code, name, type, subtype, system_key)
    values ('3100', 'Opening Balance Equity', 'equity', 'Equity', 'opening_equity')
    on conflict (code) do update set system_key = excluded.system_key
    returning id`) as { id: string }[];
  return row.id;
}

/** Allocate `count` sequential JE numbers from the number series. */
async function allocateNumbers(count: number): Promise<string[]> {
  let s = (await sql`select id, prefix, next_number, padding from number_series where document_type = 'journal_entry'`) as any[];
  if (!s.length) {
    s = (await sql`insert into number_series (document_type, prefix, next_number, padding) values ('journal_entry','JE-',1,5) returning id, prefix, next_number, padding`) as any[];
  }
  const { id, prefix, next_number, padding } = s[0];
  const start = Number(next_number);
  await sql`update number_series set next_number = ${start + count}, updated_at = now() where id = ${id}`;
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(padding, "0")}`);
}

async function postEntry(entryNumber: string, date: Date, memo: string, lines: [string, number, number][]) {
  const [e] = (await sql`
    insert into journal_entries (entry_number, date, memo, status, source, posted_at)
    values (${entryNumber}, ${date.toISOString()}, ${memo}, 'posted', 'backfill', now())
    returning id`) as { id: string }[];
  let i = 0;
  for (const [accountId, debit, credit] of lines) {
    await sql`insert into journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
      values (${e.id}, ${accountId}, ${debit.toFixed(2)}, ${credit.toFixed(2)}, ${memo}, ${i++})`;
  }
}

async function main() {
  const cash = await acctId("cash");
  const sales = await acctId("sales");
  const inventory = await acctId("inventory");
  if (!cash || !sales || !inventory) throw new Error("System accounts (cash/sales/inventory) not found — run migrations first.");
  const openingEquity = await ensureOpeningEquity();

  // Idempotent: clear any prior backfill.
  const del = (await sql`delete from journal_entries where source = 'backfill' returning id`) as any[];
  console.log(`cleared ${del.length} prior backfill entries`);

  // Real inventory valuation (on hand × cost).
  const invVal = (await sql`select coalesce(sum((on_hand)::numeric * (cost)::numeric),0)::float v from inventory_items where active = true`) as { v: number }[];
  const inventoryValue = Math.round(invVal[0].v * 100) / 100;

  // Real current-fiscal-year revenue by month.
  const months = (await sql`
    select date_part('year', doc_date)::int y, date_part('month', doc_date)::int m,
      coalesce(sum(doc_total),0)::float total
    from historical_orders
    where canceled = false and doc_date >= ${FY_START}
    group by 1,2 order by 1,2`) as { y: number; m: number; total: number }[];

  const revMonths = months.filter((r) => Math.round(r.total * 100) / 100 > 0);
  const numbers = await allocateNumbers(1 + revMonths.length);
  let ni = 0;

  // 1) Opening balance: Dr Inventory / Cr Opening Balance Equity.
  await postEntry(numbers[ni++], new Date(`${FY_START}T12:00:00Z`), "Opening balance — inventory valuation (SAP backup)", [
    [inventory, inventoryValue, 0],
    [openingEquity, 0, inventoryValue],
  ]);

  // 2) Monthly revenue: Dr Cash / Cr Sales.
  let revTotal = 0;
  for (const r of revMonths) {
    const amount = Math.round(r.total * 100) / 100;
    revTotal += amount;
    const monthEnd = new Date(Date.UTC(r.y, r.m, 0, 12)); // last day of month
    const date = monthEnd > NOW ? NOW : monthEnd;
    const label = `${r.y}-${String(r.m).padStart(2, "0")}`;
    await postEntry(numbers[ni++], date, `Sales revenue — ${label} (SAP order history)`, [
      [cash, amount, 0],
      [sales, 0, amount],
    ]);
  }

  console.log(`opening inventory: $${inventoryValue.toLocaleString()}`);
  console.log(`posted ${revMonths.length} monthly revenue entries, FY total $${revTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  console.log("done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
