/**
 * SUPERSEDED (2026-08-07) by scripts/import-sap-expenses.mjs, which posts the
 * REAL expenses from the SAP backup (the backup DOES have expenses — in JDT1/
 * OACT; this script's old assumption that it didn't was wrong). Do NOT run this
 * anymore — it would re-add fake estimates alongside the real data. Kept for
 * history only.
 *
 * Post MODELED operating expenses to the general ledger, scaled to the real
 * monthly revenue already seeded from the SAP backup. These are ESTIMATES —
 * every entry is tagged source='estimate' and is idempotently removable.
 *
 * One balanced entry per month:
 *   Dr COGS, Payroll, Rent, Utilities, Marketing, Bank Fees, Depreciation
 *   Cr Cash (all cash expenses)   Cr Accumulated Depreciation (non-cash)
 *
 * Run: npx tsx --env-file=.env.local scripts/seed-gl-expenses.ts
 */
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

// Variable rates (% of that month's real revenue) + fixed monthly amounts.
const RATE = { cogs: 0.58, payroll: 0.22, marketing: 0.03, fees: 0.02 };
const FIXED = { rent: 35_000, utilities: 10_000, depreciation: 10_000 };
const r2 = (n: number) => Math.round(n * 100) / 100;

async function byCode(code: string): Promise<string> {
  const r = (await sql`select id from gl_accounts where code = ${code}`) as { id: string }[];
  if (!r[0]) throw new Error(`GL account ${code} not found`);
  return r[0].id;
}

async function allocateNumbers(count: number): Promise<string[]> {
  let s = (await sql`select id, prefix, next_number, padding from number_series where document_type = 'journal_entry'`) as any[];
  if (!s.length) s = (await sql`insert into number_series (document_type, prefix, next_number, padding) values ('journal_entry','JE-',1,5) returning id, prefix, next_number, padding`) as any[];
  const { id, prefix, next_number, padding } = s[0];
  const start = Number(next_number);
  await sql`update number_series set next_number = ${start + count}, updated_at = now() where id = ${id}`;
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(padding, "0")}`);
}

async function postEntry(entryNumber: string, date: Date, memo: string, lines: [string, number, number][]) {
  const [e] = (await sql`insert into journal_entries (entry_number, date, memo, status, source, posted_at)
    values (${entryNumber}, ${date.toISOString()}, ${memo}, 'posted', 'estimate', now()) returning id`) as { id: string }[];
  let i = 0;
  for (const [accountId, debit, credit] of lines) {
    if (debit === 0 && credit === 0) continue;
    await sql`insert into journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
      values (${e.id}, ${accountId}, ${debit.toFixed(2)}, ${credit.toFixed(2)}, ${memo}, ${i++})`;
  }
}

async function main() {
  const A = {
    cash: await byCode("1000"), accumDep: await byCode("1510"),
    cogs: await byCode("5000"), payroll: await byCode("6000"), rent: await byCode("6100"),
    utilities: await byCode("6200"), marketing: await byCode("6400"), depreciation: await byCode("6500"), fees: await byCode("6900"),
  };

  const del = (await sql`delete from journal_entries where source = 'estimate' returning id`) as any[];
  console.log(`cleared ${del.length} prior estimate entries`);

  // Mirror the real revenue months already posted (source='backfill', Cr Sales).
  const months = (await sql`
    select date_part('year', je.date)::int y, date_part('month', je.date)::int m,
      je.date d, coalesce(sum(jl.credit),0)::float revenue
    from journal_entries je
    join journal_lines jl on jl.entry_id = je.id
    join gl_accounts a on a.id = jl.account_id and a.system_key = 'sales'
    where je.source = 'backfill' and je.status = 'posted'
    group by 1,2, je.date order by 1,2`) as { y: number; m: number; d: string; revenue: number }[];

  if (!months.length) { console.log("No seeded revenue found — run seed-gl-from-history.ts first."); return; }

  const numbers = await allocateNumbers(months.length);
  const tot = { cogs: 0, payroll: 0, rent: 0, utilities: 0, marketing: 0, fees: 0, depreciation: 0 };

  for (let i = 0; i < months.length; i++) {
    const mo = months[i];
    const rev = mo.revenue;
    const cogs = r2(rev * RATE.cogs), payroll = r2(rev * RATE.payroll), marketing = r2(rev * RATE.marketing), fees = r2(rev * RATE.fees);
    const { rent, utilities, depreciation } = FIXED;
    const cashCredit = r2(cogs + payroll + marketing + fees + rent + utilities);
    tot.cogs += cogs; tot.payroll += payroll; tot.rent += rent; tot.utilities += utilities; tot.marketing += marketing; tot.fees += fees; tot.depreciation += depreciation;

    const label = `${mo.y}-${String(mo.m).padStart(2, "0")}`;
    await postEntry(numbers[i], new Date(mo.d), `Modeled operating expenses — ${label} (estimate)`, [
      [A.cogs, cogs, 0], [A.payroll, payroll, 0], [A.rent, rent, 0], [A.utilities, utilities, 0],
      [A.marketing, marketing, 0], [A.fees, fees, 0], [A.depreciation, depreciation, 0],
      [A.cash, 0, cashCredit], [A.accumDep, 0, depreciation],
    ]);
  }

  const grand = Object.values(tot).reduce((s, v) => s + v, 0);
  console.log(`posted ${months.length} monthly expense entries`);
  console.log("totals:", Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`])));
  console.log(`total modeled expenses: $${grand.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
