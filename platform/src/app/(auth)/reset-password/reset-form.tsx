"use client";

import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "@/lib/auth/actions";
import { Field, SubmitButton, FormError } from "@/components/form";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, {});

  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Set a new password</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Minimum 10 characters, with an uppercase, lowercase, and number.
        </p>
      </div>
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} details={state.fieldErrors} />
      <Field label="New password" name="password" type="password" autoComplete="new-password" required autoFocus />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}
