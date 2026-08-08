/**
 * Capture the MULTI-YEAR financial history (real revenue + expenses) from the
 * SAP backup (GMGoLive) into the MakeReady GL as an additive layer, so the
 * income statement is real for every fiscal year FY2011–FY2025.
 *
 * Reads C:\Users\CWall\gmw-pnl-history.txt (ym|FormatCode|AcctName|drawer|net)
 * = monthly P&L per account from JDT1 (drawers 4=Revenue 5=CostOfSales 6=OpEx
 * 7=NonOp 8=Tax), EXCLUDING SAP monthly-closing entries (TransType -3), for
 * RefDate 2010-10-01 .. 2025-10-01 (prior fiscal years; leaves the current-FY
 * entries untouched — no double count). Posts one balanced monthly journal
 * entry (real accounts on one side, Cash as the net-cash-flow plug).
 *
 * Idempotent: clears prior source='sap_history'. Run: node scripts/import-sap-pnl-history.mjs
 *
 * NOTE: this reconstructs the income statement. Balance-sheet cash is the
 * running net-income plug (real assets/liabilities/distributions are not
 * imported), so the P&L is real but the balance sheet is indicative only.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined; };
const sql = neon(get("DATABASE_URL") || get("POSTGRES_URL"));
const FILE = "C:\\Users\\CWall\\gmw-pnl-history.txt";

const rows = readFileSync(FILE, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes("|")).map((l) => {
  const [ym, code, name, drawer, net] = l.split("|");
  return { ym: ym.trim(), code: code.trim(), name: name.trim(), drawer: Number(drawer), net: Number(net) };
}).filter((r) => r.code && Number.isFinite(r.net) && r.net !== 0);

const typeFor = (d) => (d === 4 ? "revenue" : "expense");
const subtypeFor = (d) => ({ 4: "Revenue", 5: "Cost of Sales", 6: "Operating Expenses", 7: "Non-Operating", 8: "Taxation" }[d] || "Other");

async function byCode(code) { const r = await sql`select id from gl_accounts where code = ${code}`; return r[0]?.id ?? null; }
async function ensureAccount(code, name, drawer) {
  const ex = await sql`select id from gl_accounts where code = ${code}`;
  if (ex.length) return ex[0].id;
  const [row] = await sql`insert into gl_accounts (code, name, type, subtype, active) values (${code}, ${name}, ${typeFor(drawer)}, ${subtypeFor(drawer)}, true) returning id`;
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
    values (${entryNumber}, ${dateISO}, ${memo}, 'posted', 'sap_history', now()) returning id`;
  const payload = lines.filter(([, d, c]) => !(d === 0 && c === 0)).map(([account_id, debit, credit], i) => ({ entry_id: e.id, account_id, debit: debit.toFixed(2), credit: credit.toFixed(2), memo, sort_order: i }));
  if (payload.length) {
    await sql`insert into journal_lines (entry_id, account_id, debit, credit, memo, sort_order)
      select entry_id, account_id, debit::numeric, credit::numeric, memo, sort_order
      from json_to_recordset(${JSON.stringify(payload)}::json) as x(entry_id uuid, account_id uuid, debit text, credit text, memo text, sort_order int)`;
  }
}

async function main() {
  const cashId = await byCode("1000");
  if (!cashId) throw new Error("Cash (1000) account missing");

  const seen = new Map();
  for (const r of rows) if (!seen.has(r.code)) seen.set(r.code, r);
  const idByCode = new Map();
  for (const r of seen.values()) idByCode.set(r.code, await ensureAccount(r.code, r.name, r.drawer));
  console.log(`ensured ${idByCode.size} P&L accounts`);

  const del = await sql`delete from journal_entries where source = 'sap_history' returning id`;
  console.log(`cleared ${del.length} prior sap_history entries`);

  const byMonth = new Map();
  for (const r of rows) { if (!byMonth.has(r.ym)) byMonth.set(r.ym, []); byMonth.get(r.ym).push(r); }
  const months = [...byMonth.keys()].sort();
  const numbers = await allocateNumbers(months.length);
  let mi = 0;
  for (const ym of months) {
    const lines = [];
    let totalDr = 0, totalCr = 0;
    for (const r of byMonth.get(ym)) {
      const id = idByCode.get(r.code);
      if (r.net > 0) { lines.push([id, r.net, 0]); totalDr += r.net; }
      else { lines.push([id, 0, -r.net]); totalCr += -r.net; }
    }
    const diff = Math.round((totalDr - totalCr) * 100) / 100;
    if (diff > 0) lines.push([cashId, 0, diff]);
    else if (diff < 0) lines.push([cashId, -diff, 0]);
    await postEntry(numbers[mi++], `${ym}-15T12:00:00.000Z`, `Financial history — ${ym} (from SAP)`, lines);
    if (mi % 24 === 0) console.log(`  posted ${mi}/${months.length} months`);
  }
  console.log(`posted ${months.length} monthly P&L history entries (FY2011–FY2025).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
