/**
 * Capture REAL operating expenses from the SAP B1 backup (GMGoLive) into the
 * MakeReady general ledger, replacing the earlier MODELED estimates.
 *
 * Reads C:\Users\CWall\gmw-expenses.txt (pipe-delimited: ym|code|name|drawer|net),
 * exported from GMGoLive JDT1 (drawers 5=Cost of Sales, 6=Operating Costs) for the
 * current fiscal year (>= 2025-10-01, which is open so there are no year-end
 * closing entries to filter). Creates a real expense account per SAP account, then
 * posts one balanced monthly journal entry (Dr real expense accounts / Cr Cash,
 * with Depreciation crediting Accumulated Depreciation).
 *
 * Idempotent: clears prior source='estimate' and source='sap' entries first.
 * Run: node scripts/import-sap-expenses.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined; };
const sql = neon(get("DATABASE_URL") || get("POSTGRES_URL"));
const FILE = "C:\\Users\\CWall\\gmw-expenses.txt";

const rows = readFileSync(FILE, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes("|")).map((l) => {
  const [ym, code, name, drawer, net] = l.split("|");
  return { ym: ym.trim(), code: code.trim(), name: name.trim(), drawer: Number(drawer), net: Number(net) };
}).filter((r) => r.code && Number.isFinite(r.net) && r.net > 0);

async function byCode(code) {
  const r = await sql`select id from gl_accounts where code = ${code}`;
  return r[0]?.id ?? null;
}
async function ensureExpenseAccount(code, name, drawer) {
  const existing = await sql`select id from gl_accounts where code = ${code}`;
  if (existing.length) return existing[0].id;
  const subtype = drawer === 5 ? "Cost of Sales" : "Operating Expenses";
  const [row] = await sql`insert into gl_accounts (code, name, type, subtype, active) values (${code}, ${name}, 'expense', ${subtype}, true) returning id`;
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
    values (${entryNumber}, ${dateISO}, ${memo}, 'posted', 'sap', now()) returning id`;
  let i = 0;
  for (const [accountId, debit, credit] of lines) {
    if (debit === 0 && credit === 0) continue;
    await sql`insert into journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
      values (${e.id}, ${accountId}, ${debit.toFixed(2)}, ${credit.toFixed(2)}, ${memo}, ${i++})`;
  }
}

async function main() {
  const cashId = await byCode("1000");
  const accumDepId = await byCode("1510");
  if (!cashId || !accumDepId) throw new Error("Cash (1000) or Accumulated Depreciation (1510) account missing");

  // Ensure a real GL account for each SAP expense account.
  const idByCode = new Map();
  const seen = new Map();
  for (const r of rows) if (!seen.has(r.code)) seen.set(r.code, r);
  for (const r of seen.values()) idByCode.set(r.code, await ensureExpenseAccount(r.code, r.name, r.drawer));
  console.log(`ensured ${idByCode.size} real expense accounts`);

  // Replace prior modeled estimates (and any earlier SAP run).
  const delEst = await sql`delete from journal_entries where source = 'estimate' returning id`;
  const delSap = await sql`delete from journal_entries where source = 'sap' returning id`;
  console.log(`cleared ${delEst.length} estimate + ${delSap.length} prior SAP entries`);

  // One balanced entry per month.
  const byMonth = new Map();
  for (const r of rows) { if (!byMonth.has(r.ym)) byMonth.set(r.ym, []); byMonth.get(r.ym).push(r); }
  const months = [...byMonth.keys()].sort();
  const numbers = await allocateNumbers(months.length);
  let grand = 0;
  for (let mi = 0; mi < months.length; mi++) {
    const ym = months[mi];
    const lines = [];
    let cash = 0, dep = 0;
    for (const r of byMonth.get(ym)) {
      lines.push([idByCode.get(r.code), r.net, 0]);
      if (/depreciation/i.test(r.name)) dep += r.net; else cash += r.net;
      grand += r.net;
    }
    if (cash > 0) lines.push([cashId, 0, cash]);
    if (dep > 0) lines.push([accumDepId, 0, dep]);
    await postEntry(numbers[mi], `${ym}-15T12:00:00.000Z`, `Operating expenses — ${ym} (from SAP)`, lines);
    console.log(`  ${ym}: ${byMonth.get(ym).length} accounts`);
  }
  console.log(`posted ${months.length} monthly SAP expense entries; total $${grand.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
