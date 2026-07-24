"use client";

import { useActionState } from "react";
import { updateBusinessPartnerAction, type CrmState } from "@/lib/crm/actions";
import { AdminField, AdminSelect, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function BpEditForm({
  bp,
  groups,
  showFinance,
}: {
  bp: {
    id: string;
    companyName: string;
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
          label="Account group"
          name="accountGroupId"
          defaultValue={bp.accountGroupId ?? ""}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
        />
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
