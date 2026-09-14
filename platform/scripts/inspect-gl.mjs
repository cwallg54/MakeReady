/** Quick read-only look at the live GL: account codes, entry volume, periods. */
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

const accounts = await sql`select count(*)::int n,
  count(*) filter (where code ~ '^[0-9]{7}$')::int seven_digit,
  count(*) filter (where code ~ '^[0-9]{4}$')::int four_digit,
  count(*) filter (where natural_code is not null)::int with_natural
  from gl_accounts`;
console.log("gl_accounts:", accounts[0]);

const sample = await sql`select code, name, type, system_key from gl_accounts order by code limit 20`;
console.log("\nsample accounts:");
for (const a of sample) console.log(` ${a.code.padEnd(10)} ${a.name.slice(0, 42).padEnd(44)} ${a.type}${a.system_key ? " [" + a.system_key + "]" : ""}`);

const je = await sql`select count(*)::int entries, min(date)::date first, max(date)::date last,
  count(*) filter (where status='posted')::int posted, count(distinct source)::int sources from journal_entries`;
console.log("\njournal_entries:", je[0]);

const bySource = await sql`select source, count(*)::int n, min(date)::date first, max(date)::date last from journal_entries group by source order by n desc limit 12`;
console.log("\nby source:");
for (const r of bySource) console.log(` ${r.source.padEnd(20)} ${String(r.n).padStart(7)}  ${r.first} -> ${r.last}`);

const lines = await sql`select count(*)::int n from journal_lines`;
console.log("\njournal_lines:", lines[0].n);

const seg = await sql`select count(*)::int n from gl_segments`;
const fy = await sql`select count(*)::int years from fiscal_years`;
const fp = await sql`select count(*)::int periods from fiscal_periods`;
console.log("segments:", seg[0].n, "fiscal years:", fy[0].years, "periods:", fp[0].periods);

const ss = await sql`select fiscal_year_start_month, gl_closing_date from system_settings limit 1`;
console.log("settings:", ss[0]);
