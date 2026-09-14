/**
 * Go-live cutover: bring the OPEN items across from SAP so the finance desk has
 * real work in front of it on day one instead of empty screens.
 *
 *   1. Open AR invoices (with their part-payments) and open credit memos
 *   2. Open AP bills — already loaded as history, so their true status, due
 *      date and part-payment are corrected rather than duplicated
 *   3. Sales-rep user accounts, linked to the sales_reps records
 *
 * GL opening balances are deliberately NOT posted. The full SAP GL history is
 * already loaded and ties to SAP within a penny (AR control 1,994,152.78
 * against SAP's 1,994,152.79), so posting these documents to the ledger would
 * count the same money twice. Every document here is written WITHOUT a journal
 * entry: the ledger already carries the balance, these rows carry the detail
 * behind it.
 *
 * Idempotent — re-run it against a fresher SAP export on the real go-live day
 * and it updates in place.
 *
 * Run: node --env-file=.env.local scripts/cutover-open-items.mjs [--commit]
 *      (without --commit it reports what it would do and writes nothing)
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const DIR =
  process.env.SAP_EXPORT_DIR ??
  "C:/Users/CWall/AppData/Local/Temp/claude/C--Users-CWall/e7b0c45d-7879-41fe-bd20-d3a64c0e1ee5/scratchpad/sap";
const COMMIT = process.argv.includes("--commit");
const CUTOVER = "2026-07-23"; // the date the SAP backup was taken

const read = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8").replace(/^\uFEFF/, ""));
const arr = (x) => (Array.isArray(x) ? x : [x]);
const round2 = (n) => Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;
const money = (n) => round2(n).toFixed(2);
const usd = (n) => `$${round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

console.log(COMMIT ? "COMMITTING\n" : "DRY RUN — nothing is written (pass --commit to apply)\n");

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------
const bpRows = await sql`select id, legacy_code from business_partners where legacy_code is not null`;
const bpByCode = new Map(bpRows.map((b) => [b.legacy_code, b.id]));

// SAP holds payment terms by GroupNum; the terms importer keyed them by a slug
// of the name, so the same slug rule rebuilds that mapping here.
const slug = (name) => name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 20) || "TERM";
const codeByGroup = new Map();
for (const t of arr(read("terms.json"))) {
  const name = String(t.PymntGroup ?? "").trim();
  if (!name) continue;
  let code = slug(name);
  if ([...codeByGroup.values()].includes(code)) code = `${code}${t.GroupNum}`;
  codeByGroup.set(Number(t.GroupNum), code);
}
const termRows = await sql`select id, code, name from payment_terms`;
const termByCode = new Map(termRows.map((t) => [t.code, t]));
const termForGroup = (groupNum) => termByCode.get(codeByGroup.get(Number(groupNum))) ?? null;

const [actor] = await sql`
  select u.id from users u join user_roles r on r.user_id = u.id
  where r.role = 'admin' order by u.created_at limit 1`;
const ACTOR = actor?.id ?? null;
console.log(`customers with a legacy code: ${bpByCode.size} | payment terms: ${termByCode.size}\n`);

// ---------------------------------------------------------------------------
// 1. Open AR invoices
// ---------------------------------------------------------------------------
const openAr = arr(read("open_ar.json"));
let arIns = 0, arUpd = 0, arNoCustomer = 0, arNilBalance = 0, arBalance = 0, arPart = 0, arNoTerms = 0;

for (const inv of openAr) {
  const bpId = bpByCode.get(inv.CardCode);
  if (!bpId) { arNoCustomer++; continue; }

  const total = round2(inv.DocTotal);
  const paid = round2(inv.PaidToDate);
  const tax = round2(inv.VatSum);
  const balance = round2(total - paid);
  if (balance <= 0.005) { arNilBalance++; continue; }

  arBalance = round2(arBalance + balance);
  if (paid > 0.005) arPart++;

  const term = termForGroup(inv.GroupNum);
  if (!term) arNoTerms++;

  // The customer's own copy shows the SAP document number, so that number comes
  // across rather than a fresh internal one — somebody ringing up about an
  // invoice has to be able to find it.
  const number = `SI-${inv.DocNum}`;
  const status = paid > 0.005 ? "partial" : "sent";
  const po = inv.NumAtCard ? ` Customer PO ${String(inv.NumAtCard).trim()}.` : "";

  if (!COMMIT) { arIns++; continue; }

  const [row] = await sql`
    insert into invoices (invoice_number, bp_id, status, issue_date, due_date, terms, terms_id,
                          subtotal, tax, total, notes, created_by, created_at)
    values (${number}, ${bpId}, ${status}, ${inv.DocDate}, ${inv.DueDate},
            ${term?.name ?? null}, ${term?.id ?? null},
            ${money(total - tax)}, ${money(tax)}, ${money(total)},
            ${`Open balance carried over from SAP at cutover ${CUTOVER}.${po}`}, ${ACTOR}, ${inv.DocDate})
    on conflict (invoice_number) do update set
      bp_id = excluded.bp_id, status = excluded.status, issue_date = excluded.issue_date,
      due_date = excluded.due_date, terms = excluded.terms, terms_id = excluded.terms_id,
      subtotal = excluded.subtotal, tax = excluded.tax, total = excluded.total,
      updated_at = now()
    returning id, (xmax = 0) as inserted`;
  row.inserted ? arIns++ : arUpd++;

  // One summary line so the document has a body. SAP keeps the line detail;
  // what matters at cutover is the balance the customer owes.
  await sql`delete from invoice_lines where invoice_id = ${row.id}`;
  await sql`
    insert into invoice_lines (invoice_id, description, qty, unit_price, extended, sort_order)
    values (${row.id}, ${`Balance carried forward from SAP invoice ${inv.DocNum}`}, 1,
            ${money(total - tax)}, ${money(total - tax)}, 0)`;

  // A part-paid invoice carries the settled portion as an opening application,
  // so the open balance is exact and it is plain the cash was taken in SAP.
  if (paid > 0.005) {
    const ref = `SAP-${inv.DocNum}`;
    const [already] = await sql`
      select p.id from payments p join ar_applications a on a.payment_id = p.id
      where a.invoice_id = ${row.id} and p.reference = ${ref} limit 1`;
    if (!already) {
      const [pay] = await sql`
        insert into payments (bp_id, invoice_id, method, reference, amount, received_date, notes, created_by)
        values (${bpId}, ${row.id}, 'other', ${ref}, ${money(paid)}, ${inv.DocDate},
                ${`Settled in SAP before cutover ${CUTOVER}; recorded so the open balance is right. Not posted to the GL.`}, ${ACTOR})
        returning id`;
      await sql`
        insert into ar_applications (invoice_id, source, payment_id, amount, applied_on, created_by)
        values (${row.id}, 'payment', ${pay.id}, ${money(paid)}, ${inv.DocDate}, ${ACTOR})`;
    }
  }
}
console.log(`1. Open AR invoices — ${arIns} new, ${arUpd} refreshed, ${arPart} part-paid`);
console.log(`   carried: ${usd(arBalance)}`);
if (arNoCustomer) console.log(`   ${arNoCustomer} skipped: no matching customer`);
if (arNilBalance) console.log(`   ${arNilBalance} skipped: nothing outstanding`);
if (arNoTerms) console.log(`   ${arNoTerms} had no matching payment term (due date still carried)`);

// ---------------------------------------------------------------------------
// 2. Open credit memos
// ---------------------------------------------------------------------------
const openCredits = arr(read("open_credits.json"));
let cmIns = 0, cmUpd = 0, cmSkipped = 0, cmValue = 0;

for (const cm of openCredits) {
  const bpId = bpByCode.get(cm.CardCode);
  if (!bpId) { cmSkipped++; continue; }
  const open = round2(Number(cm.DocTotal) - Number(cm.PaidToDate));
  if (open <= 0.005) { cmSkipped++; continue; }
  cmValue = round2(cmValue + open);

  if (!COMMIT) { cmIns++; continue; }

  const tax = round2(cm.VatSum);
  const [row] = await sql`
    insert into credit_memos (memo_number, bp_id, status, issue_date, reason,
                              subtotal, tax, total, notes, created_by, created_at)
    values (${`SC-${cm.DocNum}`}, ${bpId}, 'open', ${cm.DocDate},
            ${cm.Comments ? String(cm.Comments).trim().slice(0, 200) : "Credit carried over from SAP"},
            ${money(open - tax)}, ${money(tax)}, ${money(open)},
            ${`Unapplied credit carried over from SAP at cutover ${CUTOVER}.`}, ${ACTOR}, ${cm.DocDate})
    on conflict (memo_number) do update set
      bp_id = excluded.bp_id, status = excluded.status, issue_date = excluded.issue_date,
      subtotal = excluded.subtotal, tax = excluded.tax, total = excluded.total, updated_at = now()
    returning id, (xmax = 0) as inserted`;
  row.inserted ? cmIns++ : cmUpd++;

  await sql`delete from credit_memo_lines where memo_id = ${row.id}`;
  await sql`
    insert into credit_memo_lines (memo_id, description, qty, unit_price, extended, sort_order)
    values (${row.id}, ${`Credit carried forward from SAP credit memo ${cm.DocNum}`}, 1,
            ${money(open - tax)}, ${money(open - tax)}, 0)`;
}
console.log(`\n2. Open credit memos — ${cmIns} new, ${cmUpd} refreshed, ${cmSkipped} skipped`);
console.log(`   carried: ${usd(cmValue)}`);

// ---------------------------------------------------------------------------
// 3. Open AP — correct the bills already loaded as history
// ---------------------------------------------------------------------------
// Every SAP AP invoice came across in the history load marked 'paid'. The ones
// that are genuinely still open need putting back into the payables queue; they
// are matched on the bill number the history load used.
const openAp = arr(read("open_ap.json"));
let apFixed = 0, apMissing = 0, apBalance = 0, apPart = 0;

for (const b of openAp) {
  const billNumber = `SAP-${b.DocEntry}`;
  const total = round2(b.DocTotal);
  const paid = round2(b.PaidToDate);
  const balance = round2(total - paid);
  if (balance <= 0.005) continue;
  apBalance = round2(apBalance + balance);
  if (paid > 0.005) apPart++;

  if (!COMMIT) {
    const [hit] = await sql`select 1 as x from bills where bill_number = ${billNumber}`;
    hit ? apFixed++ : apMissing++;
    continue;
  }

  const ref = b.NumAtCard ? String(b.NumAtCard).trim() : "";
  const updated = await sql`
    update bills set
      status = ${paid > 0.005 ? "partial" : "open"},
      due_date = ${b.DueDate},
      vendor_ref = coalesce(nullif(${ref}, ''), vendor_ref),
      notes = ${`Open at cutover ${CUTOVER}; carried over from SAP.`},
      updated_at = now()
    where bill_number = ${billNumber}
    returning id, vendor_id`;

  if (!updated.length) { apMissing++; continue; }
  apFixed++;

  if (paid > 0.005) {
    const payRef = `SAP-${b.DocNum}`;
    const [already] = await sql`
      select 1 as x from bill_payments where bill_id = ${updated[0].id} and reference = ${payRef}`;
    if (!already) {
      await sql`
        insert into bill_payments (bill_id, vendor_id, method, reference, amount, paid_date, notes, created_by)
        values (${updated[0].id}, ${updated[0].vendor_id}, 'other', ${payRef}, ${money(paid)}, ${b.DocDate},
                ${`Paid in SAP before cutover ${CUTOVER}; recorded so the outstanding balance is right. Not posted to the GL.`},
                ${ACTOR})`;
    }
  }
}
console.log(`\n3. Open AP bills — ${apFixed} reopened, ${apPart} part-paid`);
console.log(`   carried: ${usd(apBalance)}`);
if (apMissing) console.log(`   ${apMissing} not found in the imported history`);

// ---------------------------------------------------------------------------
// 4. Sales-rep accounts
// ---------------------------------------------------------------------------
// Accounts are created DORMANT — status inactive, no password — so nobody can
// sign in and no invitation goes anywhere until the addresses are confirmed.
// SAP holds no email addresses for these people, so the company convention is
// used as a placeholder and has to be checked before anyone is invited.
//
// SAP's salesperson list mixes real people with routing slots (House, Stock,
// Inactive Account) and an outside agency; only people get a login.
const NOT_A_PERSON = /^(stock|house|web|none|inactive account|creative endeavors)$/i;
const reps = arr(read("active_reps.json"));
const emailFor = (name) =>
  `${name.trim().toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean).join(".")}@g54.com`;

let created = 0, linked = 0, alreadyLinked = 0, noRepRow = 0;
const touched = [];

for (const r of reps) {
  const name = String(r.SlpName ?? "").trim();
  if (!name || NOT_A_PERSON.test(name)) continue;
  // Switched off in SAP with no orders this year is not somebody needing a login.
  if (r.Active !== "Y" && !Number(r.FY26Orders)) continue;

  const [repRow] = await sql`select id, user_id from sales_reps where code = ${String(r.SlpCode)}`;
  if (!repRow) { noRepRow++; continue; }
  if (repRow.user_id) { alreadyLinked++; continue; }

  const email = emailFor(name);
  const [existing] = await sql`
    select id from users where lower(email) = ${email} or lower(name) = ${name.toLowerCase()} limit 1`;
  touched.push(`${name} <${email}>${existing ? " — linked to an existing user" : ""}`);

  if (!COMMIT) { existing ? linked++ : created++; continue; }

  let userId = existing?.id;
  if (userId) {
    linked++;
  } else {
    const [u] = await sql`
      insert into users (email, name, password_hash, status, must_reset_password)
      values (${email}, ${name}, null, 'inactive', true)
      returning id`;
    userId = u.id;
    await sql`insert into user_roles (user_id, role) values (${userId}, 'sales_rep') on conflict do nothing`;
    created++;
  }
  await sql`update sales_reps set user_id = ${userId} where id = ${repRow.id}`;
}
console.log(`\n4. Sales reps — ${created} dormant accounts, ${linked} linked to an existing user, ${alreadyLinked} already linked`);
if (noRepRow) console.log(`   ${noRepRow} had no sales_reps row`);
for (const u of touched) console.log(`   ${u}`);
if (touched.length) {
  console.log("   Created inactive with no password. Confirm the addresses, then activate and invite from /admin/users.");
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------
if (COMMIT) {
  const [c] = await sql`
    select
      (select coalesce(sum(total - coalesce(
                (select sum(a.amount) from ar_applications a where a.invoice_id = "invoices"."id"), 0)), 0)
         from invoices where voided_at is null and status in ('sent','partial')) as ar_open,
      (select coalesce(sum(total - coalesce(
                (select sum(p.amount) from bill_payments p where p.bill_id = "bills"."id"), 0)), 0)
         from bills where voided_at is null and status in ('open','partial')) as ap_open,
      (select coalesce(sum(total), 0) from credit_memos where status = 'open' and voided_at is null) as credits`;

  const line = (label, got, want) => {
    const delta = round2(Number(got) - want);
    console.log(
      `   ${label.padEnd(14)} platform ${usd(got).padStart(15)}   SAP ${usd(want).padStart(15)}   ${
        Math.abs(delta) < 0.02 ? "ties" : `off by ${usd(delta)}`
      }`,
    );
  };
  console.log(`\nAgainst SAP at cutover ${CUTOVER}:`);
  line("AR open", c.ar_open, arBalance);
  line("AP open", c.ap_open, apBalance);
  line("Open credits", c.credits, cmValue);
  console.log("\nThe GL was not touched — it already carries these balances from the SAP history load.");
}
