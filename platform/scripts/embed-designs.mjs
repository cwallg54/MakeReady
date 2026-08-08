// One-time (re-runnable) backfill: embed the design catalogue's text into
// pgvector so the Design Library supports semantic search. Uses Voyage's
// multimodal model so artwork images can later share the same vector space.
//
//   node scripts/embed-designs.mjs           # embed designs not yet embedded
//   node scripts/embed-designs.mjs --force   # re-embed everything
//
// Requires VOYAGE_API_KEY and DATABASE_URL in .env.local.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const get = (k) => { const m = env.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined; };
const DB = get("DATABASE_URL") || get("POSTGRES_URL");
const KEY = get("VOYAGE_API_KEY");
const FORCE = process.argv.includes("--force");
if (!KEY) { console.error("VOYAGE_API_KEY is not set in .env.local — get one at voyageai.com."); process.exit(1); }
const sql = neon(DB);
const MODEL = "voyage-multimodal-3.5";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Free-tier (no payment method) limits are 3 RPM / 10K TPM; set THROTTLE_MS=0
// once a payment method is added to run at full speed.
const THROTTLE_MS = Number(get("VOYAGE_THROTTLE_MS") ?? "21000");
const BATCH = THROTTLE_MS ? 50 : 128;

async function embed(texts, inputType, attempt = 0) {
  const res = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, input_type: inputType, inputs: texts.map((t) => ({ content: [{ type: "text", text: t }] })) }),
  });
  if (res.status === 429 && attempt < 8) {
    console.log(`  rate-limited; waiting 30s (retry ${attempt + 1})`);
    await sleep(30000);
    return embed(texts, inputType, attempt + 1);
  }
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

// 1. Confirm the embedding dimension from a live call.
const dim = (await embed(["dimension probe"], "document"))[0].length;
console.log(`Embedding dimension: ${dim}`);

// 2. Ensure pgvector + the embeddings table + an ANN index.
await sql`create extension if not exists vector`;
await sql.query(`create table if not exists design_embeddings (
  design_id uuid primary key references design_items(id) on delete cascade,
  embedding vector(${dim}) not null,
  content text not null,
  updated_at timestamptz not null default now()
)`);
await sql`create index if not exists design_embeddings_hnsw on design_embeddings using hnsw (embedding vector_cosine_ops)`;

// 3. Gather designs worth embedding (those with a description or a meaningful item #).
const rows = await sql`
  select d.id, d.item_number, d.description, d.cust_number, b.company_name as company
  from design_items d
  left join business_partners b on b.id = d.bp_id
  where d.archived = false and coalesce(length(d.description), 0) > 0`;

// content per design: item # + description + customer, so a text query can hit any of them.
const items = rows.map((r) => ({
  id: r.id,
  content: [r.item_number, r.description, r.company || r.cust_number].filter(Boolean).join(" — "),
}));

// 4. Skip already-embedded designs unless --force.
let todo = items;
if (!FORCE) {
  const done = new Set((await sql`select design_id from design_embeddings`).map((r) => r.design_id));
  todo = items.filter((i) => !done.has(i.id));
}
console.log(`${items.length} designs with descriptions; ${todo.length} to embed${FORCE ? " (forced)" : ""}.`);

// 5. Batch-embed and upsert (throttled to respect free-tier rate limits).
let n = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const vecs = await embed(batch.map((b) => b.content), "document");
  for (let j = 0; j < batch.length; j++) {
    const lit = `[${vecs[j].join(",")}]`;
    await sql`
      insert into design_embeddings (design_id, embedding, content, updated_at)
      values (${batch[j].id}, ${lit}::vector, ${batch[j].content}, now())
      on conflict (design_id) do update set embedding = excluded.embedding, content = excluded.content, updated_at = now()`;
  }
  n += batch.length;
  console.log(`  embedded ${n}/${todo.length}`);
  if (THROTTLE_MS && i + BATCH < todo.length) await sleep(THROTTLE_MS);
}
console.log("Done.");
