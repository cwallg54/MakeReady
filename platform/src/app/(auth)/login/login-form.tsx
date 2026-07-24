"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "@/lib/auth/actions";
import { Field, SubmitButton, FormError } from "@/components/form";

export function LoginForm({ resetDone }: { resetDone?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-400">Access your MakeReady workspace.</p>
      </div>

      {resetDone && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Password updated. Sign in with your new password.
        </p>
      )}
      <FormError message={state.error} />

      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-neutral-400">
          <input type="checkbox" name="rememberMe" className="h-4 w-4 rounded border-neutral-600 bg-neutral-800" />
          Remember me
        </label>
        <Link href="/forgot-password" className="text-neutral-300 hover:text-white">
          Forgot password?
        </Link>
      </div>

      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
