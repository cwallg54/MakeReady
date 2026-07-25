"use client";

import { useActionState } from "react";
import { createTemplateAction, type TemplateState } from "@/lib/sales/template-actions";
import { AdminField, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function TemplateCreateForm() {
  const [state, action] = useActionState<TemplateState, FormData>(createTemplateAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Template name" name="name" required hint="e.g. Softgoods (Apparel)" />
        <AdminField label="Sizes (optional)" name="sizeOptions" hint="Comma-separated, e.g. S, M, L, XL" />
      </div>
      <AdminField label="Description" name="description" />
      <AdminSubmit>Create template</AdminSubmit>
    </form>
  );
}
