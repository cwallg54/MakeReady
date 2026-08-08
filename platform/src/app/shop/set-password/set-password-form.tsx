"use client";

import { useActionState } from "react";
import { setPasswordAction, type SetPwState } from "./actions";

const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<SetPwState, FormData>(setPasswordAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-600">New password</span>
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className={inp} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-neutral-600">Confirm password</span>
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className={inp} />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
        {pending ? "Setting up…" : "Set password & sign in"}
      </button>
      <p className="text-[11px] text-neutral-400">At least 8 characters. This activates your account and signs you in.</p>
    </form>
  );
}
