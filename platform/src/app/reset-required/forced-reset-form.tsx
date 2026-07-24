"use client";

import { useActionState } from "react";
import { forcedResetAction, type FormState } from "@/lib/auth/actions";
import { Field, SubmitButton, FormError } from "@/components/form";

export function ForcedResetForm() {
  const [state, action] = useActionState<FormState, FormData>(forcedResetAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} details={state.fieldErrors} />
      <Field label="New password" name="password" type="password" autoComplete="new-password" required autoFocus />
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required />
      <SubmitButton>Set password &amp; continue</SubmitButton>
    </form>
  );
}
