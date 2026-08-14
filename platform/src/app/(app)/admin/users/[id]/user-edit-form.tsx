"use client";

import { useActionState } from "react";
import { updateUserAction, type AdminState } from "@/lib/admin/actions";
import { AdminField, AdminSubmit } from "@/components/admin-form";
import { RolesField } from "@/components/roles-field";
import { FormError } from "@/components/form";
import type { Role } from "@/db/schema";

export function UserEditForm({
  id,
  name,
  email,
  phone,
  roles,
}: {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: Role[];
}) {
  const [state, action] = useActionState<AdminState, FormData>(updateUserAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Full name" name="name" required defaultValue={name} />
        <AdminField label="Email" name="email" type="email" required defaultValue={email} />
        <AdminField label="Mobile (for SMS alerts)" name="phone" defaultValue={phone} hint="Optional — used for text alerts when SMS is enabled" />
      </div>
      <RolesField selected={roles} />
      <AdminSubmit>Save changes</AdminSubmit>
    </form>
  );
}
