import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { orderFormTemplates, templateItems } from "../src/db/schema";

async function ensureTemplate(t: {
  name: string;
  slug: string;
  description: string;
  sizeOptions: string[] | null;
  charges: unknown[];
  items: { code: string | null; name: string; unitPrice: string }[];
}) {
  const existing = await db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.slug, t.slug) });
  if (existing) {
    console.log(`= template exists: ${t.slug}`);
    return;
  }
  const [row] = await db
    .insert(orderFormTemplates)
    .values({ name: t.name, slug: t.slug, description: t.description, sizeOptions: t.sizeOptions, charges: t.charges })
    .returning({ id: orderFormTemplates.id });
  if (t.items.length) {
    await db.insert(templateItems).values(t.items.map((it, i) => ({ templateId: row.id, code: it.code, name: it.name, unitPrice: it.unitPrice, sortOrder: i })));
  }
  console.log(`+ seeded template: ${t.slug} (${t.items.length} items)`);
}

async function main() {
  // Softgoods (apparel / silk-screen) — charge rules from the SOFTGOODS order form.
  await ensureTemplate({
    name: "Softgoods (Apparel)",
    slug: "softgoods",
    description: "Silk-screen / embroidery apparel. Garment lines priced individually; decoration via charges.",
    sizeOptions: ["S", "M", "L", "XL", "2XL", "3XL", "4XL"],
    charges: [
      { key: "new-screen-prep", label: "New ASI Screen Preparation", type: "per_color", rate: 15, unit: "colors", appliesWhen: "new" },
      { key: "reorder-screen-prep", label: "Reorder ASI Screen Prep", type: "per_color", rate: 7.5, unit: "colors", appliesWhen: "reorder" },
      { key: "midrun-color", label: "Mid-run Color Change", type: "per_color", rate: 15, unit: "colors", appliesWhen: "always" },
      { key: "art-rework", label: "Art prep rework (non-vector)", type: "per_hour", rate: 65, unit: "hours", appliesWhen: "always" },
      { key: "custom-art", label: "Customized Art", type: "per_hour", rate: 65, unit: "hours", appliesWhen: "always" },
      { key: "rush-1wk", label: "Rush — 1 week", type: "percent", rate: 20, appliesWhen: "always" },
      { key: "rush-2wk", label: "Rush — 2 weeks", type: "percent", rate: 10, appliesWhen: "always" },
    ],
    items: [],
  });

  // Wood Products — fixed catalog from the Wood Product order form.
  await ensureTemplate({
    name: "Wood Products",
    slug: "wood-product",
    description: "Wood magnets, ornaments, key chains, etc. Fixed item catalog.",
    sizeOptions: null,
    charges: [{ key: "setup", label: "Setup charge", type: "flat", rate: 0, appliesWhen: "new" }],
    items: [
      { code: null, name: "Magnet (7 Sq Inch)", unitPrice: "2.50" },
      { code: null, name: "Magnet (9 Sq Inch)", unitPrice: "3.50" },
      { code: null, name: "Magnet 2 Layer (9 Sq Inch)", unitPrice: "4.50" },
      { code: null, name: "Key Chains", unitPrice: "3.25" },
      { code: null, name: "Ornaments", unitPrice: "3.95" },
      { code: null, name: "Pins", unitPrice: "2.50" },
      { code: null, name: "Book Marks", unitPrice: "0" },
      { code: null, name: "Bottle Opener", unitPrice: "0" },
      { code: null, name: "Post Cards", unitPrice: "0" },
    ],
  });

  console.log("Template seed complete.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
