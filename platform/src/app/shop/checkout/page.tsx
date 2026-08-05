import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { cartDetails } from "@/lib/store/cart";
import { CheckoutForm } from "./checkout-form";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();
  const { items, subtotal } = await cartDetails(!!customer);
  if (items.length === 0) redirect("/shop/cart");

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-neutral-900">Checkout</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <CheckoutForm loggedIn={!!customer} />

        <aside className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Order summary</h2>
          <ul className="divide-y divide-neutral-100 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 py-2">
                <span className="text-neutral-700">{i.qty}× {i.title}</span>
                <span className="shrink-0 tabular-nums text-neutral-900">{money(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-sm font-semibold">
            <span>Subtotal</span><span className="tabular-nums">{money(subtotal)}</span>
          </div>
          {customer && <p className="text-xs text-emerald-700">Signed in as {customer.name} — billed to your account.</p>}
          <Link href="/shop/cart" className="block text-center text-xs text-neutral-500 hover:text-neutral-800">← Edit cart</Link>
        </aside>
      </div>
    </div>
  );
}
