import Link from "next/link";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { customerDiscountPct } from "@/lib/store/cart";
import { getCartTotals } from "@/lib/store/promo";
import { setQtyAction, removeFromCartAction, applyPromoAction, removePromoAction } from "@/lib/store/storefront-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function CartPage() {
  const customer = await getCurrentCustomer();
  const { items, subtotal, discount, total, promoCode, promoError } = await getCartTotals(!!customer, await customerDiscountPct(customer));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">Your cart</h1>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
          Your cart is empty. <Link href="/shop" className="text-brand-ink hover:underline">Browse the store →</Link>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 p-3">
                {i.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.image} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-neutral-200 object-cover" />
                ) : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-200 text-[9px] text-neutral-300">no img</span>}
                <div className="min-w-0 flex-1">
                  <Link href={`/shop/p/${i.slug}`} className="text-sm font-medium text-neutral-900 hover:underline">{i.title}</Link>
                  <div className="text-xs text-neutral-500">{money(i.unitPrice)} each{i.sku ? ` · ${i.sku}` : ""}</div>
                  <form action={setQtyAction} className="mt-1 flex items-center gap-1">
                    <input type="hidden" name="productId" value={i.id} />
                    <input name="qty" type="number" min="0" defaultValue={i.qty} className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-brand" />
                    <button className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50">Update</button>
                  </form>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-neutral-900">{money(i.lineTotal)}</div>
                  <form action={removeFromCartAction}>
                    <input type="hidden" name="productId" value={i.id} />
                    <button className="text-xs text-red-600 hover:text-red-800">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>

          {/* Promo code */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            {promoCode && !promoError ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-emerald-700">Code <strong>{promoCode}</strong> applied — you saved {money(discount)}.</span>
                <form action={removePromoAction}><button className="text-xs text-neutral-500 hover:text-neutral-800">Remove</button></form>
              </div>
            ) : (
              <form action={applyPromoAction} className="flex items-end gap-2">
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-neutral-600">Promo code</span>
                  <input name="code" defaultValue={promoCode ?? ""} placeholder="Enter code" className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-brand" />
                </label>
                <button className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Apply</button>
              </form>
            )}
            {promoError && <p className="mt-2 text-xs text-red-600">{promoError}</p>}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
            <div>
              <div className="flex items-center gap-3 text-sm text-neutral-500">Subtotal <span className="tabular-nums text-neutral-700">{money(subtotal)}</span></div>
              {discount > 0 && <div className="flex items-center gap-3 text-sm text-emerald-700">Discount <span className="tabular-nums">−{money(discount)}</span></div>}
              <div className="mt-1 text-2xl font-bold text-neutral-900">{money(total)}</div>
              <div className="text-xs text-neutral-400">Taxes & shipping calculated by our team. {customer ? "Billed to your account." : "You'll enter contact details next."}</div>
            </div>
            <Link href="/shop/checkout" className="rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-700">Checkout →</Link>
          </div>
        </>
      )}
    </div>
  );
}
