"use client";

import { useActionState } from "react";
import { updateCampaignAction, type CampaignState } from "@/lib/automation/actions";
import { AdminField, AdminSelect, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function CampaignMetaForm({
  id,
  name,
  description,
  trigger,
  active,
}: {
  id: string;
  name: string;
  description: string;
  trigger: string;
  active: boolean;
}) {
  const [state, action] = useActionState<CampaignState, FormData>(updateCampaignAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Campaign name" name="name" required defaultValue={name} />
        <AdminSelect
          label="Trigger"
          name="trigger"
          defaultValue={trigger}
          options={[
            { value: "lead_created", label: "When a lead is created" },
            { value: "manual", label: "Manual enrollment only" },
          ]}
        />
      </div>
      <AdminField label="Description" name="description" defaultValue={description} />
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="active" defaultChecked={active} className="h-4 w-4" /> Active
      </label>
      <AdminSubmit>Save campaign</AdminSubmit>
    </form>
  );
}
