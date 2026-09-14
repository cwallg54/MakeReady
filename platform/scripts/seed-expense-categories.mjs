/**
 * Seed the expense categories the legacy ERP had configured, mapped to REAL GL
 * accounts.
 *
 * The add-on shipped with all ten categories pointing at the same placeholder
 * account, which is why nothing was ever bookable from it. Each one is mapped
 * here to the travel/office account the chart already has, so a claim posts
 * where it belongs — and carries that account's department segment with it.
 *
 * Idempotent. Run: node --env-file=.env.local scripts/seed-expense-categories.mjs
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// code, name, GL account code, needs an explanation?
const CATEGORIES = [
  ["HOTEL", "Hotel", "6505650", false],
  ["AIRFARE", "Airfare", "6525650", false],
  ["PERDIEM", "Per Diem", "6515650", false],
  ["RENTALCAR", "Rental Car", "6530650", false],
  ["GAS", "Gas", "6510650", false],
  ["OTHERTRAVEL", "Other Travel", "6535650", false],
  ["CONFERENCE", "Conference", "6621650", true],
  ["OFFICE", "Office Expenses", "6707670", true],
  ["MEALS", "Meals", "6515650", false],
  ["OTHER", "Other", "7888690", true],
];

let seeded = 0;
const unmapped = [];

for (const [i, [code, name, acctCode, requiresDetail]] of CATEGORIES.entries()) {
  const acct = await sql`select id, name from gl_accounts where code = ${acctCode} and active limit 1`;
  if (!acct.length) unmapped.push(`${code} -> ${acctCode}`);

  await sql`
    insert into expense_categories (code, name, account_id, requires_detail, active, sort_order)
    values (${code}, ${name}, ${acct[0]?.id ?? null}, ${requiresDetail}, true, ${i * 10})
    on conflict (code) do update set name = excluded.name, account_id = excluded.account_id,
      requires_detail = excluded.requires_detail, sort_order = excluded.sort_order`;
  seeded++;
}

console.log(`expense categories: ${seeded}`);
if (unmapped.length) {
  console.log(`no GL account found for: ${unmapped.join(", ")}`);
}

const rows = await sql`
  select c.code, c.name, c.requires_detail, a.code acct, a.name acct_name, s.short_name segment
  from expense_categories c
  left join gl_accounts a on a.id = c.account_id
  left join gl_segments s on s.id = a.segment_id
  order by c.sort_order`;

console.log("\ncategory -> account:");
for (const r of rows) {
  console.log(
    ` ${String(r.code).padEnd(12)} ${String(r.name).padEnd(16)} ${String(r.acct ?? "—").padEnd(9)} ${String(r.acct_name ?? "unmapped").padEnd(34)} ${r.segment ?? ""}${r.requires_detail ? "  (needs detail)" : ""}`,
  );
}
