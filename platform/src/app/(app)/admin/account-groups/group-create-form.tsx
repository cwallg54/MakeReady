"use client";

import { useActionState } from "react";
import { createAccountGroupAction, type AdminState } from "@/lib/admin/actions";
import { AdminField, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function GroupCreateForm() {
  const [state, action] = useActionState<AdminState, FormData>(createAccountGroupAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Account group added.</p>}
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Code" name="code" required hint="Short key, e.g. WHOLESALE" />
        <AdminField label="Name" name="name" required hint="Display name, e.g. Wholesale" />
      </div>
      <AdminSubmit>Add account group</AdminSubmit>
    </form>
  );
}
