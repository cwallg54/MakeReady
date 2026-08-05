import Link from "next/link";
import type { StoreListItem } from "@/lib/store/storefront-data";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProductCard({ p }: { p: StoreListItem }) {
  const discounted = p.price < p.retailPrice;
  return (
    <Link href={`/shop/p/${p.slug}`} className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:shadow-md">
      <div className="flex aspect-square items-center justify-center bg-neutral-50">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt={p.title} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-neutral-300">No image</span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        {p.categoryName && <span className="mb-0.5 text-[10px] uppercase tracking-wide text-neutral-400">{p.categoryName}</span>}
        <span className="line-clamp-2 text-sm font-medium text-neutral-900 group-hover:text-brand-ink">{p.title}</span>
        <span className="mt-auto pt-2 text-sm font-semibold text-neutral-900">
          {money(p.price)}
          {discounted && <span className="ml-1.5 text-xs font-normal text-neutral-400 line-through">{money(p.retailPrice)}</span>}
        </span>
      </div>
    </Link>
  );
}
