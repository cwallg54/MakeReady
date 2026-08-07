import Link from "next/link";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { getStoreSettings } from "@/lib/store/settings";
import { customerDiscountPct } from "@/lib/store/cart";
import { listCategories, listProducts } from "@/lib/store/storefront-data";
import { aiCatalogAnswer } from "@/lib/ai/catalog-answer";
import { ProductCard } from "./product-card";

export const dynamic = "force-dynamic";

export default async function ShopHome({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const sp = await searchParams;
  const [customer, settings] = await Promise.all([getCurrentCustomer(), getStoreSettings()]);
  const b2b = !!customer;

  // When public shopping is disabled, guests must sign in as a Business Partner.
  if (!settings.publicEnabled && !customer) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-bold text-neutral-900">{settings.heroHeadline || settings.storeName}</h1>
        <p className="mt-2 text-sm text-neutral-500">This store is for Business Partners. Please sign in to shop.</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/shop/login" className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Sign in</Link>
          <Link href="/shop/register" className="rounded-md border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Request an account</Link>
        </div>
      </div>
    );
  }

  const discountPct = await customerDiscountPct(customer);
  const [cats, products] = await Promise.all([
    listCategories(),
    listProducts({ b2b, discountPct, q: sp.q?.trim(), categorySlug: sp.cat }),
  ]);
  const activeCat = cats.find((c) => c.slug === sp.cat);
  const aiPick = sp.q?.trim() ? await aiCatalogAnswer(sp.q.trim(), "product catalog", products.map((p) => p.title)) : null;

  return (
    <div className="space-y-6">
      {!sp.q && !sp.cat && (
        <div className="rounded-2xl bg-neutral-900 px-6 py-8 text-white sm:px-10 sm:py-12">
          <h1 className="text-2xl font-bold sm:text-3xl">{settings.heroHeadline || settings.storeName}</h1>
          <p className="mt-1 max-w-xl text-sm text-neutral-300">
            {settings.heroSubtext || (b2b ? "Welcome back — you're seeing your Business Partner catalog and pricing." : "Shop in-stock gear. Sign in as a Business Partner for account pricing and the full catalog.")}
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
      {aiPick && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm leading-relaxed text-neutral-800">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-ink">✨ AI pick</p>
          {aiPick}
        </div>
      )}
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
