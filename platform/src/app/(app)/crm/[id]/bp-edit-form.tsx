"use client";

import { useActionState } from "react";
import { updateBusinessPartnerAction, type CrmState } from "@/lib/crm/actions";
import { AdminField, AdminSelect, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function BpEditForm({
  bp,
  groups,
  owners,
  scoped,
  showFinance,
}: {
  bp: {
    id: string;
    companyName: string;
    lifecycleStage: string;
    leadSource: string | null;
    ownerId: string | null;
    tags: string[] | null;
    accountGroupId: string | null;
    email: string | null;
    phone: string | null;
    addressStreet: string | null;
    addressCity: string | null;
    addressState: string | null;
    addressZip: string | null;
    creditLimit: string | null;
    paymentTerms: string | null;
    internalNotes: string | null;
  };
  groups: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  scoped: boolean;
  showFinance: boolean;
}) {
  const [state, action] = useActionState<CrmState, FormData>(updateBusinessPartnerAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={bp.id} />
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Company name" name="companyName" required defaultValue={bp.companyName} />
        <AdminSelect
          label="Stage"
          name="lifecycleStage"
          defaultValue={bp.lifecycleStage}
          options={[
            { value: "lead", label: "Lead" },
            { value: "prospect", label: "Prospect" },
            { value: "customer", label: "Customer" },
          ]}
        />
        <AdminSelect
          label="Lead source"
          name="leadSource"
          defaultValue={bp.leadSource ?? ""}
          options={[
            { value: "", label: "— Unknown —" },
            { value: "Website", label: "Website" },
            { value: "Referral", label: "Referral" },
            { value: "Trade Show", label: "Trade Show" },
            { value: "Cold Outreach", label: "Cold Outreach" },
            { value: "Existing Relationship", label: "Existing Relationship" },
            { value: "Other", label: "Other" },
          ]}
        />
        <AdminSelect
          label="Account group"
          name="accountGroupId"
          defaultValue={bp.accountGroupId ?? ""}
          options={[{ value: "", label: "— None —" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
        />
        {!scoped && (
          <AdminSelect
            label="Owner"
            name="ownerId"
            defaultValue={bp.ownerId ?? ""}
            options={[{ value: "", label: "— Unassigned —" }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
          />
        )}
        <AdminField label="Tags" name="tags" defaultValue={(bp.tags ?? []).join(", ")} hint="Comma-separated" />
        <AdminField label="Email" name="email" type="email" defaultValue={bp.email ?? ""} />
        <AdminField label="Phone" name="phone" defaultValue={bp.phone ?? ""} />
        <AdminField label="Street" name="addressStreet" defaultValue={bp.addressStreet ?? ""} />
        <AdminField label="City" name="addressCity" defaultValue={bp.addressCity ?? ""} />
        <AdminField label="State" name="addressState" defaultValue={bp.addressState ?? ""} />
        <AdminField label="ZIP" name="addressZip" defaultValue={bp.addressZip ?? ""} />
        {showFinance && (
          <>
            <AdminField label="Credit limit" name="creditLimit" type="number" defaultValue={bp.creditLimit ?? ""} />
            <AdminField label="Payment terms" name="paymentTerms" defaultValue={bp.paymentTerms ?? ""} />
          </>
        )}
      </div>
      {showFinance && <AdminField label="Internal notes" name="internalNotes" defaultValue={bp.internalNotes ?? ""} />}
      <AdminSubmit>Save changes</AdminSubmit>
    </form>
  );
}
