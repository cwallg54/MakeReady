"use client";

import { useActionState } from "react";
import { createCampaignAction, type CampaignState } from "@/lib/automation/actions";
import { AdminField, AdminSelect, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function CampaignCreateForm() {
  const [state, action] = useActionState<CampaignState, FormData>(createCampaignAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Campaign name" name="name" required hint="e.g. New Lead Nurture" />
        <AdminSelect
          label="Trigger"
          name="trigger"
          defaultValue="lead_created"
          options={[
            { value: "lead_created", label: "When a lead is created (auto-enroll)" },
            { value: "manual", label: "Manual enrollment only" },
          ]}
        />
      </div>
      <AdminField label="Description" name="description" />
      <AdminSubmit>Create campaign</AdminSubmit>
    </form>
  );
}
