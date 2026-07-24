"use client";

import { useActionState } from "react";
import { createUserAction, type AdminState } from "@/lib/admin/actions";
import { AdminField, AdminSubmit } from "@/components/admin-form";
import { RolesField } from "@/components/roles-field";
import { FormError } from "@/components/form";

export function UserCreateForm() {
  const [state, action] = useActionState<AdminState, FormData>(createUserAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Full name" name="name" required />
        <AdminField label="Email" name="email" type="email" required />
      </div>
      <RolesField />
      <p className="text-xs text-neutral-500">
        The new user is created inactive-until-set: they receive an email link to set their password
        and are required to choose a new one on first sign-in.
      </p>
      <AdminSubmit>Create user &amp; send invite</AdminSubmit>
    </form>
  );
}
