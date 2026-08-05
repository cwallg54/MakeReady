import Link from "next/link";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { cartDetails } from "@/lib/store/cart";
import { setQtyAction, removeFromCartAction } from "@/lib/store/storefront-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function CartPage() {
  const customer = await getCurrentCustomer();
  const { items, subtotal } = await cartDetails(!!customer);

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

          <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
            <div>
              <div className="text-sm text-neutral-500">Subtotal</div>
              <div className="text-2xl font-bold text-neutral-900">{money(subtotal)}</div>
              <div className="text-xs text-neutral-400">Taxes & shipping calculated by our team. {customer ? "Billed to your account." : "You'll enter contact details next."}</div>
            </div>
            <Link href="/shop/checkout" className="rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-700">Checkout →</Link>
          </div>
        </>
      )}
    </div>
  );
}
