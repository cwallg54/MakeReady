/**
 * Import payment terms and customer credit setup from the SAP backup.
 *
 * Terms are the credit policy, the collection trigger and the account status
 * in one field, so the behaviour flags are derived from the term's name:
 *   - "(CC)" / "Credit Card"   -> cardOnFile: charge the card when it falls due
 *   - "Prepay" / "C.O.D."      -> prepay: collect before the goods ship
 *   - Closed / Collections /
 *     Don't Sell / Inactive /
 *     Bankruptcy / Get App      -> creditAllowed: false (account on stop)
 *   - "2% 10 Net 30" style      -> early-settlement discount
 *
 * Then maps every customer onto its term, its parent account, and its credit
 * limit, matching on legacy_code (the SAP CardCode).
 *
 * Idempotent. Run:
 *   node --env-file=.env.local scripts/import-sap-terms.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const DIR = process.env.SAP_EXPORT_DIR
  ?? "C:/Users/CWall/AppData/Local/Temp/claude/C--Users-CWall/e7b0c45d-7879-41fe-bd20-d3a64c0e1ee5/scratchpad/sap";

// PowerShell writes UTF-8 with a BOM; strip it before parsing.
const read = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8").replace(/^﻿/, ""));
const arr = (x) => (Array.isArray(x) ? x : [x]);

const NO_CREDIT = /closed|collection|don.?t sell|inactive|bankrupt|get app|determining|interest|fee$/i;
const CARD = /\(cc\)|credit card|^cc |cc net/i;
const PREPAY = /prepay|prepaid|c\.?o\.?d\.?/i;

/** "2% 10 Net 30" / "1.5% 10 Days Net 30" -> { pct, days } */
function discountOf(discCode, name) {
  const src = `${discCode ?? ""} ${name ?? ""}`;
  const m = /(\d+(?:\.\d+)?)\s*%?\s*(\d+)?/.exec((discCode ?? "").trim());
  if (m && discCode) return { pct: Number(m[1]) || 0, days: Number(m[2]) || 0 };
  const n = /(\d+(?:\.\d+)?)%\s*(\d+)/.exec(src);
  return n ? { pct: Number(n[1]), days: Number(n[2]) } : { pct: 0, days: 0 };
}

const slug = (name) =>
  name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 20) || "TERM";

// ---- 1. payment terms -----------------------------------------------------
const terms = arr(read("terms.json"));
const codeByGroup = new Map();
let created = 0;

for (const [i, t] of terms.entries()) {
  const name = String(t.PymntGroup ?? "").trim();
  if (!name) continue;
  let code = slug(name);
  // Two SAP terms can slug the same ("Net 60 CC" / "CC Net 60"); keep both.
  if ([...codeByGroup.values()].includes(code)) code = `${code}${t.GroupNum}`;
  const netDays = Number(t.ExtraDays) || 0;
  const { pct, days } = discountOf(t.DiscCode, name);
  const cardOnFile = CARD.test(name);
  const prepay = PREPAY.test(name);
  const creditAllowed = !NO_CREDIT.test(name);

  await sql`
    insert into payment_terms (code, name, net_days, discount_pct, discount_days, card_on_file, prepay, credit_allowed, status_note, sort_order)
    values (${code}, ${name}, ${netDays}, ${pct}, ${days}, ${cardOnFile}, ${prepay}, ${creditAllowed},
            ${creditAllowed ? null : `Account status: ${name}`}, ${i * 10})
    on conflict (code) do update set name = excluded.name, net_days = excluded.net_days,
      discount_pct = excluded.discount_pct, discount_days = excluded.discount_days,
      card_on_file = excluded.card_on_file, prepay = excluded.prepay,
      credit_allowed = excluded.credit_allowed, status_note = excluded.status_note`;
  codeByGroup.set(Number(t.GroupNum), code);
  created++;
}
console.log(`payment terms: ${created}`);

const termRows = await sql`select id, code from payment_terms`;
const termIdByCode = new Map(termRows.map((r) => [r.code, r.id]));

// ---- 2. customers ---------------------------------------------------------
const customers = arr(read("customers_finance.json"));
console.log(`customers in export: ${customers.length}`);

const bps = await sql`select id, legacy_code from business_partners where legacy_code is not null`;
const bpByCode = new Map(bps.map((b) => [b.legacy_code, b.id]));
console.log(`business partners with a legacy code: ${bpByCode.size}`);

let termed = 0, parented = 0, limited = 0, missing = 0;
const parentPairs = [];

for (const c of customers) {
  const id = bpByCode.get(c.CardCode);
  if (!id) { missing++; continue; }

  const termId = termIdByCode.get(codeByGroup.get(Number(c.GroupNum))) ?? null;
  const credit = Number(c.CreditLine) || 0;

  if (termId || credit > 0) {
    await sql`
      update business_partners set
        terms_id = coalesce(${termId}, terms_id),
        payment_terms = coalesce(${c.PymntGroup ?? null}, payment_terms),
        credit_limit = case when ${credit}::numeric > 0 then ${credit}::numeric else credit_limit end,
        updated_at = now()
      where id = ${id}`;
    if (termId) termed++;
    if (credit > 0) limited++;
  }

  const father = (c.FatherCard ?? "").trim();
  if (father && father !== c.CardCode) parentPairs.push([id, father]);
}

// Parents resolved in a second pass so forward references work.
for (const [childId, fatherCode] of parentPairs) {
  const parentId = bpByCode.get(fatherCode);
  if (!parentId || parentId === childId) continue;
  await sql`update business_partners set parent_bp_id = ${parentId}, parent_bp_number = ${fatherCode}, updated_at = now() where id = ${childId}`;
  parented++;
}

console.log(`terms set: ${termed}, credit limits: ${limited}, parent links: ${parented}, unmatched customers: ${missing}`);

// ---- 3. summary -----------------------------------------------------------
const top = await sql`
  select t.name, t.net_days, t.card_on_file, t.prepay, t.credit_allowed, count(b.id)::int customers
  from payment_terms t left join business_partners b on b.terms_id = t.id
  group by t.id, t.name, t.net_days, t.card_on_file, t.prepay, t.credit_allowed
  having count(b.id) > 0 order by count(b.id) desc limit 12`;
console.log("\ntop terms by customer count:");
for (const r of top) {
  const flags = [r.card_on_file && "card-on-file", r.prepay && "prepay", !r.credit_allowed && "NO CREDIT"].filter(Boolean).join(", ");
  console.log(` ${String(r.name).padEnd(22)} net ${String(r.net_days).padStart(3)}  ${String(r.customers).padStart(5)} customers${flags ? "  [" + flags + "]" : ""}`);
}
