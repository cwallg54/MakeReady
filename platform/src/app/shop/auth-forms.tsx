"use client";

import { useActionState } from "react";
import { loginAction, registerAction, type StoreFormState } from "@/lib/store/storefront-actions";

const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

export function LoginForm() {
  const [state, action] = useActionState<StoreFormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-3">
      {state.error && (
        <div className={`rounded-md border px-4 py-3 text-sm ${state.pending ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>{state.error}</div>
      )}
      <label className="block"><span className={lbl}>Email</span><input name="email" type="email" required autoFocus className={inp} /></label>
      <label className="block"><span className={lbl}>Password</span><input name="password" type="password" required className={inp} /></label>
      <button className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Sign in</button>
    </form>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState<StoreFormState, FormData>(registerAction, {});
  return (
    <form action={action} className="space-y-3">
      {state.error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>}
      <label className="block"><span className={lbl}>Name</span><input name="name" required className={inp} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={lbl}>Email</span><input name="email" type="email" required className={inp} /></label>
        <label className="block"><span className={lbl}>Phone</span><input name="phone" className={inp} /></label>
      </div>
      <label className="block"><span className={lbl}>Company</span><input name="companyName" className={inp} /></label>
      <label className="block"><span className={lbl}>Password <span className="text-neutral-400">(8+ characters)</span></span><input name="password" type="password" required className={inp} /></label>
      <button className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Request an account</button>
      <p className="text-xs text-neutral-400">Business Partner accounts are approved by our team before you can order at account pricing.</p>
    </form>
  );
}
