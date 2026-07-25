"use client";

import { useActionState } from "react";
import { updateTemplateMetaAction, type TemplateState } from "@/lib/sales/template-actions";
import { AdminField, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function TemplateMetaForm({
  id,
  name,
  description,
  sizeOptions,
  defaultMarkupPct,
  active,
}: {
  id: string;
  name: string;
  description: string;
  sizeOptions: string;
  defaultMarkupPct: number;
  active: boolean;
}) {
  const [state, action] = useActionState<TemplateState, FormData>(updateTemplateMetaAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminField label="Template name" name="name" required defaultValue={name} />
        <AdminField label="Sizes (optional)" name="sizeOptions" defaultValue={sizeOptions} hint="Comma-separated" />
        <AdminField label="Default markup %" name="defaultMarkupPct" type="number" defaultValue={defaultMarkupPct} hint="Over cost when item has none" />
      </div>
      <AdminField label="Description" name="description" defaultValue={description} />
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="active" defaultChecked={active} className="h-4 w-4" /> Active (available in Quote Builder)
      </label>
      <AdminSubmit>Save details</AdminSubmit>
    </form>
  );
}
