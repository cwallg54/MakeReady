/**
 * FULL GL rebuild from the SAP backup (GMGoLive) — real balance sheet AND income
 * statement. Reads C:\Users\CWall\gmw-gl-full.txt (ym|FormatCode|AcctName|drawer|net)
 * = monthly movement per account for ALL drawers (1=Asset 2=Liab 3=Equity
 * 4=Revenue 5=COGS 6=OpEx 7=NonOp 8=Tax), EXCLUDING SAP monthly-closing entries
 * (TransType -3), from 2008-01. Because closings are excluded and every other SAP
 * entry is balanced, each month's summary self-balances (no synthetic plug).
 *
 * Supersedes the earlier finance seeds: wipes source in (estimate, backfill, sap,
 * sap_history) and reposts as source='sap_gl'. Balance sheet rolls cumulative net
 * income into equity (MakeReady statements.ts), so it ties to SAP.
 *
 * Run: node scripts/import-sap-gl-full.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined; };
const sql = neon(get("DATABASE_URL") || get("POSTGRES_URL"));
const FILE = "C:\\Users\\CWall\\gmw-gl-full.txt";

const rows = readFileSync(FILE, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes("|")).map((l) => {
  const [ym, code, name, drawer, net] = l.split("|");
  return { ym: ym.trim(), code: code.trim(), name: name.trim(), drawer: Number(drawer), net: Number(net) };
}).filter((r) => r.code && Number.isFinite(r.net) && r.net !== 0);

const typeFor = (d) => (d === 1 ? "asset" : d === 2 ? "liability" : d === 3 ? "equity" : d === 4 ? "revenue" : "expense");
const subtypeFor = (d) => ({ 1: "Assets", 2: "Liabilities", 3: "Equity", 4: "Revenue", 5: "COGS", 6: "Operating Expenses", 7: "Non-Operating", 8: "Taxation" }[d] || "Other");

async function byCode(code) { const r = await sql`select id from gl_accounts where code = ${code}`; return r[0]?.id ?? null; }
async function upsertAccount(code, name, drawer) {
  const [row] = await sql`insert into gl_accounts (code, name, type, subtype, active)
    values (${code}, ${name}, ${typeFor(drawer)}, ${subtypeFor(drawer)}, true)
    on conflict (code) do update set name = excluded.name, type = excluded.type, subtype = excluded.subtype
    returning id`;
  return row.id;
}
async function allocateNumbers(count) {
  let s = await sql`select id, prefix, next_number, padding from number_series where document_type = 'journal_entry'`;
  if (!s.length) s = await sql`insert into number_series (document_type, prefix, next_number, padding) values ('journal_entry','JE-',1,5) returning id, prefix, next_number, padding`;
  const { id, prefix, next_number, padding } = s[0];
  const start = Number(next_number);
  await sql`update number_series set next_number = ${start + count}, updated_at = now() where id = ${id}`;
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(padding, "0")}`);
}
async function postEntry(entryNumber, dateISO, memo, lines) {
  const [e] = await sql`insert into journal_entries (entry_number, date, memo, status, source, posted_at)
    values (${entryNumber}, ${dateISO}, ${memo}, 'posted', 'sap_gl', now()) returning id`;
  const payload = lines.filter(([, d, c]) => !(d === 0 && c === 0)).map(([account_id, debit, credit], i) => ({ entry_id: e.id, account_id, debit: debit.toFixed(2), credit: credit.toFixed(2), memo, sort_order: i }));
  if (payload.length) {
    await sql`insert into journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
      select entry_id, account_id, debit::numeric, credit::numeric, memo, sort_order
      from json_to_recordset(${JSON.stringify(payload)}::json) as x(entry_id uuid, account_id uuid, debit text, credit text, memo text, sort_order int)`;
  }
}

async function main() {
  // Ensure/normalize every account.
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.code)) seen.set(r.code, r);
  const idByCode = new Map();
  for (const r of seen.values()) idByCode.set(r.code, await upsertAccount(r.code, r.name, r.drawer));
  console.log(`ensured/normalized ${idByCode.size} GL accounts`);
  const roundId = await upsertAccount("9999", "Rounding", 3);

  // Replace all synthetic finance layers.
  const del = await sql`delete from journal_entries where source in ('estimate','backfill','sap','sap_history') returning id`;
  console.log(`cleared ${del.length} prior synthetic entries`);

  const byMonth = new Map();
  for (const r of rows) { if (!byMonth.has(r.ym)) byMonth.set(r.ym, []); byMonth.get(r.ym).push(r); }
  const months = [...byMonth.keys()].sort();
  const numbers = await allocateNumbers(months.length);
  let mi = 0, maxDiff = 0;
  for (const ym of months) {
    const lines = [];
    let dr = 0, cr = 0;
    for (const r of byMonth.get(ym)) {
      const id = idByCode.get(r.code);
      if (r.net > 0) { lines.push([id, r.net, 0]); dr += r.net; }
      else { lines.push([id, 0, -r.net]); cr += -r.net; }
    }
    const diff = Math.round((dr - cr) * 100) / 100;
    if (Math.abs(diff) > Math.abs(maxDiff)) maxDiff = diff;
    if (diff > 0) lines.push([roundId, 0, diff]);
    else if (diff < 0) lines.push([roundId, -diff, 0]);
    await postEntry(numbers[mi++], `${ym}-15T12:00:00.000Z`, `SAP GL — ${ym}`, lines);
    if (mi % 36 === 0) console.log(`  posted ${mi}/${months.length} months`);
  }
  console.log(`posted ${months.length} monthly GL entries; largest monthly rounding plug: $${maxDiff}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
