import Link from "next/link";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { listCategories, listProducts } from "@/lib/store/storefront-data";
import { ProductCard } from "./product-card";

export const dynamic = "force-dynamic";

export default async function ShopHome({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const sp = await searchParams;
  const customer = await getCurrentCustomer();
  const b2b = !!customer;
  const [cats, products] = await Promise.all([
    listCategories(),
    listProducts({ b2b, q: sp.q?.trim(), categorySlug: sp.cat }),
  ]);
  const activeCat = cats.find((c) => c.slug === sp.cat);

  return (
    <div className="space-y-6">
      {!sp.q && !sp.cat && (
        <div className="rounded-2xl bg-neutral-900 px-6 py-8 text-white sm:px-10 sm:py-12">
          <h1 className="text-2xl font-bold sm:text-3xl">The G54 Store</h1>
          <p className="mt-1 max-w-xl text-sm text-neutral-300">
            {b2b ? "Welcome back — you're seeing your Business Partner catalog and pricing." : "Shop in-stock gear. Sign in as a Business Partner for account pricing and the full catalog."}
          </p>
        </div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/shop" className={`rounded-full border px-3 py-1 ${!sp.cat ? "border-brand bg-brand/15 font-medium text-brand-ink" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>All</Link>
        {cats.map((c) => (
          <Link key={c.id} href={`/shop?cat=${c.slug}`} className={`rounded-full border px-3 py-1 ${sp.cat === c.slug ? "border-brand bg-brand/15 font-medium text-brand-ink" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>{c.name}</Link>
        ))}
      </div>

      {sp.q && <p className="text-sm text-neutral-500">{products.length} result{products.length === 1 ? "" : "s"} for “{sp.q}”</p>}
      {activeCat && <h2 className="text-lg font-semibold text-neutral-900">{activeCat.name}</h2>}

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
          Nothing here yet{sp.q ? " — try a different search" : ""}.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  );
}
