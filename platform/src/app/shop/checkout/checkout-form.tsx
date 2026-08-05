"use client";

import { useActionState } from "react";
import { placeOrderAction, type StoreFormState } from "@/lib/store/storefront-actions";

const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

export function CheckoutForm({ loggedIn }: { loggedIn: boolean }) {
  const [state, action] = useActionState<StoreFormState, FormData>(placeOrderAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>}

      {!loggedIn && (
        <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Your details</h2>
          <label className="block"><span className={lbl}>Name</span><input name="contactName" required className={inp} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={lbl}>Email</span><input name="contactEmail" type="email" required className={inp} /></label>
            <label className="block"><span className={lbl}>Phone</span><input name="contactPhone" className={inp} /></label>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900">Shipping & notes</h2>
        <label className="block"><span className={lbl}>Shipping address</span><textarea name="shippingAddress" rows={3} className={inp} placeholder="Street, city, state, ZIP" /></label>
        <label className="block"><span className={lbl}>Order notes (optional)</span><textarea name="notes" rows={2} className={inp} /></label>
      </div>

      <button className="w-full rounded-md bg-neutral-900 px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-700">
        {loggedIn ? "Place order on account" : "Place order"}
      </button>
      <p className="text-center text-xs text-neutral-400">
        No payment is taken online. Our team confirms your order, calculates shipping/tax, and {loggedIn ? "bills it to your account" : "follows up to arrange payment"}.
      </p>
    </form>
  );
}
