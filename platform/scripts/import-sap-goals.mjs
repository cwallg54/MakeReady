/**
 * Import sales reps, their monthly revenue goals, and the rep credited on each
 * historic order — so goal-vs-actual reads against 18 years of real sales
 * rather than only against orders raised in the platform.
 *
 * Goals are held by calendar month; the report aggregates them into the
 * Oct–Sep fiscal year.
 *
 * Idempotent. Run: node --env-file=.env.local scripts/import-sap-goals.mjs
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const DIR = process.env.SAP_EXPORT_DIR
  ?? "C:/Users/CWall/AppData/Local/Temp/claude/C--Users-CWall/e7b0c45d-7879-41fe-bd20-d3a64c0e1ee5/scratchpad/sap";

// PowerShell writes UTF-8 with a BOM; strip it before parsing.
const read = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8").replace(/^\uFEFF/, ""));
const arr = (x) => (Array.isArray(x) ? x : [x]);

// ---- 1. reps ---------------------------------------------------------------
const reps = arr(read("sales_reps.json"));
let repCount = 0;
for (const [i, r] of reps.entries()) {
  const code = String(r.SlpCode);
  const name = String(r.SlpName ?? "").trim() || `Rep ${code}`;
  const active = String(r.Active ?? "Y").toUpperCase() !== "N";
  await sql`
    insert into sales_reps (code, name, active, sort_order)
    values (${code}, ${name}, ${active}, ${i * 10})
    on conflict (code) do update set name = excluded.name, active = excluded.active, sort_order = excluded.sort_order`;
  repCount++;
}
console.log(`sales reps: ${repCount}`);

const repRows = await sql`select id, code from sales_reps`;
const repByCode = new Map(repRows.map((r) => [r.code, r.id]));

// Link reps to platform users where the names match, so orders raised in the
// platform credit the same person the history does.
const linked = await sql`
  update sales_reps r set user_id = u.id
  from users u
  where lower(trim(u.name)) = lower(trim(r.name)) and r.user_id is null
  returning r.id`;
console.log(`reps linked to a user account: ${linked.length}`);

// ---- 2. goals --------------------------------------------------------------
const goals = arr(read("sales_goals.json"));
let goalCount = 0;
let skipped = 0;

for (const g of goals) {
  const repId = repByCode.get(String(g.SlpCode));
  const amount = Number(String(g.Goal ?? "").replace(/[^0-9.-]/g, ""));
  const year = Number(g.Yr);
  const month = Number(g.Mo);
  if (!repId || !Number.isFinite(amount) || !year || !month || month < 1 || month > 12) {
    skipped++;
    continue;
  }
  await sql`
    insert into sales_goals (rep_id, year, month, amount)
    values (${repId}, ${year}, ${month}, ${amount})
    on conflict (rep_id, year, month) do update set amount = excluded.amount, updated_at = now()`;
  goalCount++;
}
console.log(`monthly goals: ${goalCount} (${skipped} skipped)`);

// ---- 3. credit historic orders to their rep --------------------------------
const map = arr(read("order_reps.json"));
console.log(`order -> rep mappings to apply: ${map.length}`);

// The HTTP driver runs every statement on its own connection, so a temp table
// would not survive between calls. Each chunk carries its own VALUES list
// instead. Both columns are numeric in the source; they are scrubbed to digits
// anyway so nothing user-shaped reaches the statement.
const digits = (v) => String(v ?? "").replace(/[^0-9]/g, "");
const CHUNK = 1000;
let updatedCount = 0;

for (let i = 0; i < map.length; i += CHUNK) {
  const pairs = map
    .slice(i, i + CHUNK)
    .map((m) => [digits(m.DocNum), digits(m.SlpCode)])
    .filter(([d, c]) => d && c);
  if (!pairs.length) continue;

  const values = pairs.map(([d, c]) => `('${d}','${c}')`).join(",");
  // sql.query returns a plain array here, with no rowCount — so count what
  // RETURNING hands back rather than trusting a field that is always undefined.
  const res = await sql.query(`
    update historical_orders h set rep_id = r.id
    from (values ${values}) as t(doc_num, code)
    join sales_reps r on r.code = t.code
    where h.doc_num = t.doc_num and h.rep_id is distinct from r.id
    returning h.id`);
  updatedCount += Array.isArray(res) ? res.length : (res.rows?.length ?? 0);
  if (i && i % 50000 === 0) console.log(`  ${i} of ${map.length} applied (${updatedCount} credited so far)...`);
}
const credited = await sql`select count(rep_id)::int n, count(*)::int total from historical_orders`;
console.log(`historic orders credited this run: ${updatedCount}; credited overall: ${credited[0].n} of ${credited[0].total}`);

// ---- summary ---------------------------------------------------------------
const summary = await sql`
  select r.name,
    count(h.id)::int orders,
    coalesce(sum(h.doc_total), 0)::numeric(16,0) revenue,
    coalesce((select sum(g.amount) from sales_goals g where g.rep_id = r.id and ((g.year = 2026 and g.month <= 9) or (g.year = 2025 and g.month >= 10))), 0)::numeric(16,0) fy26_goal
  from sales_reps r
  left join historical_orders h on h.rep_id = r.id and h.doc_date >= '2025-10-01' and h.canceled = false
  group by r.id, r.name
  having count(h.id) > 0 or coalesce((select sum(g.amount) from sales_goals g where g.rep_id = r.id and ((g.year = 2026 and g.month <= 9) or (g.year = 2025 and g.month >= 10))), 0) > 0
  order by revenue desc limit 15`;

console.log("\nFY2026 so far — actual vs goal by rep:");
for (const r of summary) {
  const rev = Number(r.revenue), goal = Number(r.fy26_goal);
  const pct = goal > 0 ? `${((rev / goal) * 100).toFixed(0)}%` : "—";
  console.log(` ${String(r.name).padEnd(22)} ${String(r.orders).padStart(6)} orders  actual ${rev.toLocaleString().padStart(11)}  goal ${goal.toLocaleString().padStart(11)}  ${pct.padStart(5)}`);
}
