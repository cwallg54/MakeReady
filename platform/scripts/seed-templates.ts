import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { orderFormTemplates, templateItems } from "../src/db/schema";

interface SeedItem {
  code: string | null;
  name: string;
  unitPrice: string;
  priceBreaks?: { minQty: number; unitPrice: number }[];
  minQty?: number;
  sizeUpcharges?: Record<string, number>;
}

async function ensureTemplate(t: {
  name: string;
  slug: string;
  description: string;
  sizeOptions: string[] | null;
  charges: unknown[];
  items: SeedItem[];
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
    await db.insert(templateItems).values(
      t.items.map((it, i) => ({
        templateId: row.id,
        code: it.code,
        name: it.name,
        unitPrice: it.unitPrice,
        priceBreaks: it.priceBreaks ?? null,
        minQty: it.minQty ?? 0,
        sizeUpcharges: it.sizeUpcharges ?? null,
        sortOrder: i,
      })),
    );
  }
  console.log(`+ seeded template: ${t.slug} (${t.items.length} items)`);
}

/** Build a caps item: base unit price = the smallest (highest-price) band. */
function cap(code: string, name: string, bands: [number, number][], minQty: number): SeedItem {
  const priceBreaks = bands.map(([minQty, unitPrice]) => ({ minQty, unitPrice }));
  return { code, name, unitPrice: String(priceBreaks[0]?.unitPrice ?? 0), priceBreaks, minQty };
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

  // Caps (OSH) — quantity price-break pricing from the CAP PRICING table
  // (effective 4/1/25). Each cap style is priced by order quantity band.
  await ensureTemplate({
    name: "Caps (OSH)",
    slug: "caps-osh",
    description: "Overseas caps priced by style and quantity band (72/144/288/432/576). Embroidery.",
    sizeOptions: null,
    charges: [
      { key: "new-digitizing", label: "New embroidery digitizing", type: "flat", rate: 45, appliesWhen: "new" },
      { key: "name-drop", label: "Name drop / personalization", type: "per_unit", rate: 0.5, unit: "caps", appliesWhen: "always" },
    ],
    items: [
      cap("RC", "RC — Richardson-style Cap", [[72, 10.5], [144, 9.25], [288, 8.25], [432, 8.0], [576, 7.75]], 72),
      cap("REN", "REN — Renegade Cap", [[72, 11.25], [144, 9.75], [288, 8.75], [432, 8.5], [576, 8.25]], 72),
      cap("VEL", "VEL — Velcro-back Cap", [[72, 13.25], [144, 11.25], [288, 10.25], [432, 10.0], [576, 9.75]], 72),
      cap("ANIMAL", "Animal Cap", [[144, 11.25], [288, 10.25], [432, 10.0], [576, 9.75]], 144),
    ],
  });

  // Baja hoodies — base garment price + size upcharges (2XL +$2, 3XL +$3).
  await ensureTemplate({
    name: "Baja Hoodies",
    slug: "baja-hoodies",
    description: "Baja hoodies with embroidered patch. Base price plus per-size upcharges; 3 per pack per size.",
    sizeOptions: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
    charges: [
      { key: "patch-emb", label: "Embroidered patch", type: "per_unit", rate: 2.5, unit: "hoodies", appliesWhen: "always" },
      { key: "new-digitizing", label: "New patch digitizing", type: "flat", rate: 45, appliesWhen: "new" },
    ],
    items: [
      { code: "73BajaPAS", name: "Baja Hoodie (PAS)", unitPrice: "0", sizeUpcharges: { "2XL": 2, "3XL": 3 } },
      { code: "73BajaPLV", name: "Baja PLV Hoodie", unitPrice: "0", sizeUpcharges: { "2XL": 2, "3XL": 3 } },
    ],
  });

  console.log("Template seed complete.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
