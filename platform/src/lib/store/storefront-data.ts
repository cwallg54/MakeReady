import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { storeProducts, storeCategories, inventoryItems } from "@/db/schema";
import { priceFor } from "./cart";

export interface StoreListItem {
  id: string;
  title: string;
  slug: string;
  price: number;
  retailPrice: number;
  featured: boolean;
  image: string | null;
  sku: string | null;
  categoryName: string | null;
}

function image(p: { imageBase64: string | null; imageMimeType: string | null; invImg: string | null; invMime: string | null }): string | null {
  if (p.imageBase64) return `data:${p.imageMimeType ?? "image/png"};base64,${p.imageBase64}`;
  if (p.invImg) return `data:${p.invMime ?? "image/png"};base64,${p.invImg}`;
  return null;
}

// Only published products; the public sees public/both, B2B customers see all.
function audienceWhere(b2b: boolean): SQL[] {
  const cond: SQL[] = [eq(storeProducts.published, true)];
  if (!b2b) cond.push(inArray(storeProducts.visibility, ["public", "both"]));
  return cond;
}

export async function listCategories() {
  return db.select({ id: storeCategories.id, name: storeCategories.name, slug: storeCategories.slug })
    .from(storeCategories).where(eq(storeCategories.active, true)).orderBy(asc(storeCategories.sortOrder), asc(storeCategories.name));
}

export async function listProducts(opts: { b2b: boolean; q?: string; categorySlug?: string; featuredOnly?: boolean; limit?: number }): Promise<StoreListItem[]> {
  const cond = audienceWhere(opts.b2b);
  if (opts.q) cond.push(or(ilike(storeProducts.title, `%${opts.q}%`), ilike(storeProducts.description, `%${opts.q}%`)) as SQL);
  if (opts.featuredOnly) cond.push(eq(storeProducts.featured, true));
  if (opts.categorySlug) cond.push(sql`${storeCategories.slug} = ${opts.categorySlug}`);

  const rows = await db.select({
    id: storeProducts.id, title: storeProducts.title, slug: storeProducts.slug,
    retailPrice: storeProducts.retailPrice, b2bPrice: storeProducts.b2bPrice, featured: storeProducts.featured,
    imageBase64: storeProducts.imageBase64, imageMimeType: storeProducts.imageMimeType,
    sku: inventoryItems.sku, invImg: inventoryItems.imageBase64, invMime: inventoryItems.imageMimeType,
    categoryName: storeCategories.name,
  }).from(storeProducts)
    .leftJoin(inventoryItems, eq(storeProducts.inventoryItemId, inventoryItems.id))
    .leftJoin(storeCategories, eq(storeProducts.categoryId, storeCategories.id))
    .where(and(...cond))
    .orderBy(desc(storeProducts.featured), asc(storeProducts.sortOrder), asc(storeProducts.title))
    .limit(opts.limit ?? 60);

  return rows.map((r) => ({
    id: r.id, title: r.title, slug: r.slug,
    price: priceFor(r, opts.b2b), retailPrice: Number(r.retailPrice),
    featured: r.featured, image: image(r), sku: r.sku, categoryName: r.categoryName,
  }));
}

export async function getProductBySlug(slug: string, b2b: boolean) {
  const cond = [eq(storeProducts.slug, slug), ...audienceWhere(b2b)];
  const [row] = await db.select({
    id: storeProducts.id, title: storeProducts.title, slug: storeProducts.slug, description: storeProducts.description,
    retailPrice: storeProducts.retailPrice, b2bPrice: storeProducts.b2bPrice,
    imageBase64: storeProducts.imageBase64, imageMimeType: storeProducts.imageMimeType,
    sku: inventoryItems.sku, onHand: inventoryItems.onHand, invImg: inventoryItems.imageBase64, invMime: inventoryItems.imageMimeType,
    categoryName: storeCategories.name,
  }).from(storeProducts)
    .leftJoin(inventoryItems, eq(storeProducts.inventoryItemId, inventoryItems.id))
    .leftJoin(storeCategories, eq(storeProducts.categoryId, storeCategories.id))
    .where(and(...cond)).limit(1);
  if (!row) return null;
  return {
    ...row,
    price: priceFor(row, b2b),
    retail: Number(row.retailPrice),
    inStock: row.onHand != null ? Number(row.onHand) > 0 : true,
    image: image(row),
  };
}
