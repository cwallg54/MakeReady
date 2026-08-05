import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { getStoreSettings } from "@/lib/store/settings";
import { customerDiscountPct } from "@/lib/store/cart";
import { getProductBySlug } from "@/lib/store/storefront-data";
import { addToCartAction } from "@/lib/store/storefront-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [customer, settings] = await Promise.all([getCurrentCustomer(), getStoreSettings()]);
  if (!settings.publicEnabled && !customer) redirect("/shop/login");
  const b2b = !!customer;
  const p = await getProductBySlug(slug, b2b, await customerDiscountPct(customer));
  if (!p) notFound();
  const hasVariants = p.variants.length > 0;
  const displayPrice = hasVariants ? Math.min(...p.variants.map((v) => v.price)) : p.price;
  const discounted = displayPrice < p.retail;

  return (
    <div className="space-y-4">
      <Link href="/shop" className="text-sm text-neutral-500 hover:text-neutral-900">← Back to store</Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt={p.title} className="h-full w-full object-contain" />
          ) : <span className="text-sm text-neutral-300">No image</span>}
        </div>

        <div>
          {p.categoryName && <span className="text-xs uppercase tracking-wide text-neutral-400">{p.categoryName}</span>}
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">{p.title}</h1>
          <div className="mt-2 flex items-baseline gap-2">
            {hasVariants && <span className="text-xs uppercase tracking-wide text-neutral-400">From</span>}
            <span className="text-2xl font-semibold text-neutral-900">{money(displayPrice)}</span>
            {discounted && <span className="text-sm text-neutral-400 line-through">{money(p.retail)}</span>}
            {b2b && discounted && <span className="rounded bg-[#8DC63F]/20 px-1.5 py-0.5 text-xs font-semibold text-brand-ink">B2B price</span>}
          </div>
          <p className="mt-1 text-sm font-medium">
            {p.inStock ? <span className="text-emerald-600">In stock</span> : <span className="text-amber-600">Currently out of stock</span>}
          </p>

          {p.description && <p className="mt-4 whitespace-pre-line text-sm text-neutral-600">{p.description}</p>}

          <form action={addToCartAction} className="mt-6 flex flex-wrap items-end gap-3">
            <input type="hidden" name="productId" value={p.id} />
            {hasVariants && (
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium text-neutral-600">Option</span>
                <select name="variantId" required defaultValue={p.variants[0]?.id} className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand">
                  {p.variants.map((v) => (
                    <option key={v.id} value={v.id}>{v.label} — {money(v.price)}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium text-neutral-600">Qty</span>
              <input name="qty" type="number" min="1" defaultValue="1" className="w-20 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
            </label>
            <button className="rounded-md bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Add to cart</button>
          </form>

          {!b2b && (
            <p className="mt-4 text-xs text-neutral-400">
              This is a stock item — no customization. Need custom printed or embroidered products?{" "}
              <Link href="/shop/login" className="text-brand-ink hover:underline">Sign in as a Business Partner</Link> or contact your rep.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
