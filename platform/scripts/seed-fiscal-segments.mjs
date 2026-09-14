/**
 * Phase A foundation seed: fiscal calendar + GL account segments.
 *
 * Idempotent. Safe to re-run.
 *   1. Sets the fiscal year to start in October (GMW runs Oct -> Sep).
 *   2. Seeds the 14 account-code segments actually used in the chart.
 *   3. Creates fiscal years FY2008..FY2031 with 12 periods each, and locks
 *      every period that ends before the current one (matching SAP, where all
 *      history is locked and only the current/future periods are open).
 *   4. Backfills gl_accounts.natural_code / segment_id from the 7-digit codes.
 *   5. Backfills journal_entries.period_id and journal_lines.segment_id.
 *
 * Run: node --env-file=.env.local scripts/seed-fiscal-segments.mjs
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const FY_START_MONTH = 10; // October

// Segment values in live use, read off the real chart of accounts.
const SEGMENTS = [
  { code: "000", name: "Unsegmented", short: "", kind: "none", sort: 0 },
  { code: "100", name: "Hard Goods", short: "HG", kind: "product_line", sort: 10 },
  { code: "200", name: "Soft Goods", short: "SG", kind: "product_line", sort: 20 },
  { code: "300", name: "Headwear", short: "HW", kind: "product_line", sort: 30 },
  { code: "510", name: "Art", short: "Art", kind: "department", sort: 40 },
  { code: "520", name: "Embroidery", short: "Emb", kind: "department", sort: 50 },
  { code: "530", name: "Warehouse", short: "WH", kind: "department", sort: 60 },
  { code: "540", name: "Silkscreen", short: "SS", kind: "department", sort: 70 },
  { code: "550", name: "Soft Hand & DTF", short: "SH/DTF", kind: "department", sort: 80 },
  { code: "640", name: "Management", short: "Mngt", kind: "overhead", sort: 90 },
  { code: "650", name: "Sales", short: "Sales", kind: "overhead", sort: 100 },
  { code: "660", name: "Purchasing", short: "Purch", kind: "overhead", sort: 110 },
  { code: "670", name: "Office", short: "Office", kind: "overhead", sort: 120 },
  { code: "690", name: "Administration", short: "Admin", kind: "overhead", sort: 130 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function buildYear(year) {
  const startCalYear = year - 1; // October start
  const periods = [];
  for (let i = 0; i < 12; i++) {
    const mi = FY_START_MONTH - 1 + i;
    const y = startCalYear + Math.floor(mi / 12);
    const m = (mi % 12) + 1;
    periods.push({
      code: `${year}-${pad(i + 1)}`,
      name: `${MONTHS[m - 1]} ${y}`,
      periodNumber: i + 1,
      quarter: Math.floor(i / 3) + 1,
      startDate: `${y}-${pad(m)}-01`,
      endDate: `${y}-${pad(m)}-${pad(lastDay(y, m))}`,
    });
  }
  return { year, startDate: periods[0].startDate, endDate: periods[11].endDate, periods };
}

// ---- 1. fiscal year start month -------------------------------------------
await sql`update system_settings set fiscal_year_start_month = ${FY_START_MONTH}`;
console.log(`fiscal year start month -> ${FY_START_MONTH} (October)`);

// ---- 2. segments -----------------------------------------------------------
for (const s of SEGMENTS) {
  await sql`
    insert into gl_segments (code, name, short_name, kind, sort_order)
    values (${s.code}, ${s.name}, ${s.short}, ${s.kind}, ${s.sort})
    on conflict (code) do update set name = excluded.name, short_name = excluded.short_name,
      kind = excluded.kind, sort_order = excluded.sort_order`;
}
console.log(`segments seeded: ${SEGMENTS.length}`);

// ---- 3. fiscal years + periods --------------------------------------------
const FIRST_FY = 2008;
const LAST_FY = 2031;
const today = new Date().toISOString().slice(0, 10);
let createdYears = 0;
let createdPeriods = 0;

for (let y = FIRST_FY; y <= LAST_FY; y++) {
  const spec = buildYear(y);
  const [yr] = await sql`
    insert into fiscal_years (year, start_date, end_date, status)
    values (${y}, ${spec.startDate}, ${spec.endDate}, 'open')
    on conflict (year) do update set start_date = excluded.start_date, end_date = excluded.end_date
    returning id, (xmax = 0) as inserted`;
  if (yr.inserted) createdYears++;

  for (const p of spec.periods) {
    const [row] = await sql`
      insert into fiscal_periods (fiscal_year_id, code, name, period_number, quarter, start_date, end_date, status)
      values (${yr.id}, ${p.code}, ${p.name}, ${p.periodNumber}, ${p.quarter}, ${p.startDate}, ${p.endDate}, 'open')
      on conflict (code) do nothing
      returning id`;
    if (row) createdPeriods++;
  }
}
console.log(`fiscal years: +${createdYears}, periods: +${createdPeriods} (FY${FIRST_FY}-FY${LAST_FY})`);

// Close the books behind us: everything that ended before LAST month is
// locked, last month sits in 'closing' (adjustments still allowed while the
// month is being closed), and the current + future periods stay open.
const priorMonthStart = await sql`select (date_trunc('month', ${today}::date) - interval '1 month')::date d`;
const prior = priorMonthStart[0].d;

const locked = await sql`
  update fiscal_periods set status = 'locked'
  where end_date < ${prior}::date and status <> 'locked'
  returning id`;
const closing = await sql`
  update fiscal_periods set status = 'closing', closed_at = null, closed_by = null
  where ${prior}::date between start_date and end_date and status <> 'closing'
  returning id`;
const lockedYears = await sql`
  update fiscal_years set status = 'locked'
  where end_date < ${prior}::date and status <> 'locked'
  returning id`;
console.log(`locked ${locked.length} historic periods, ${closing.length} period in closing, ${lockedYears.length} closed fiscal years`);

// ---- 4. backfill account segments ------------------------------------------
const acct = await sql`
  update gl_accounts a set
    natural_code = left(a.code, 4),
    segment_id = s.id
  from gl_segments s
  where a.code ~ '^[0-9]{7}$' and s.code = right(a.code, 3)
    and (a.natural_code is distinct from left(a.code, 4) or a.segment_id is distinct from s.id)
  returning a.id`;
console.log(`accounts segmented: ${acct.length}`);

// Legacy 4-digit system accounts (cash, ar, ...) keep their code as the natural
// account and sit in the unsegmented bucket.
const legacy = await sql`
  update gl_accounts a set natural_code = a.code, segment_id = s.id
  from gl_segments s where s.code = '000' and a.code !~ '^[0-9]{7}$' and a.natural_code is null
  returning a.id`;
console.log(`legacy accounts defaulted to unsegmented: ${legacy.length}`);

// ---- 5. backfill journal analytics ----------------------------------------
const entries = await sql`
  update journal_entries e set period_id = p.id
  from fiscal_periods p
  where e.date::date between p.start_date and p.end_date and e.period_id is null
  returning e.id`;
console.log(`journal entries stamped with a period: ${entries.length}`);

const jlines = await sql`
  update journal_lines l set segment_id = a.segment_id
  from gl_accounts a
  where a.id = l.account_id and l.segment_id is null and a.segment_id is not null
  returning l.id`;
console.log(`journal lines segmented: ${jlines.length}`);

// ---- summary ---------------------------------------------------------------
const [cur] = await sql`select code, name, status from fiscal_periods where ${today}::date between start_date and end_date`;
console.log(`\ncurrent period: ${cur ? `${cur.code} (${cur.name}) — ${cur.status}` : "none"}`);
const openPeriods = await sql`select code from fiscal_periods where status = 'open' order by start_date limit 3`;
console.log(`first open periods: ${openPeriods.map((p) => p.code).join(", ")}`);
