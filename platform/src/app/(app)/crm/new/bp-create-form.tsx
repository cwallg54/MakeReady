"use client";

import { useActionState } from "react";
import { createBusinessPartnerAction, type CrmState } from "@/lib/crm/actions";
import { AdminField, AdminSelect, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function BpCreateForm({
  groups,
  owners,
  scoped,
  showFinance,
}: {
  groups: { id: string; name: string }[];
  owners: { id: string; name: string }[];
  scoped: boolean;
  showFinance: boolean;
}) {
  const [state, action] = useActionState<CrmState, FormData>(createBusinessPartnerAction, {});
  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      {state.duplicate && (
        <label className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <input type="checkbox" name="confirmDuplicate" value="on" className="h-4 w-4" />
          Create anyway (a company with this name already exists)
        </label>
      )}

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900">Account</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Company name" name="companyName" required />
          <AdminSelect
            label="Stage"
            name="lifecycleStage"
            defaultValue="lead"
            options={[
              { value: "lead", label: "Lead" },
              { value: "prospect", label: "Prospect" },
              { value: "customer", label: "Customer" },
            ]}
          />
          <AdminSelect
            label="Lead source"
            name="leadSource"
            defaultValue=""
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
            defaultValue=""
            options={[{ value: "", label: "— None (assign later) —" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
          />
          {!scoped && (
            <AdminSelect
              label="Owner"
              name="ownerId"
              defaultValue=""
              options={[{ value: "", label: "— Unassigned —" }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
            />
          )}
          <AdminField label="Tags" name="tags" hint="Comma-separated, e.g. VIP, screen-print" />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900">Primary contact</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Contact name" name="primaryContactName" required />
          <AdminField label="Contact email" name="primaryContactEmail" type="email" required />
          <AdminField label="Phone" name="phone" />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900">Address</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Street" name="addressStreet" />
          <AdminField label="City" name="addressCity" />
          <AdminField label="State" name="addressState" />
          <AdminField label="ZIP" name="addressZip" />
        </div>
      </section>

      {showFinance && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Terms</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Credit limit" name="creditLimit" type="number" />
            <AdminField label="Payment terms" name="paymentTerms" hint="e.g. Net 30" />
          </div>
          <AdminField label="Internal notes" name="internalNotes" />
        </section>
      )}

      <AdminSubmit>Create Business Partner</AdminSubmit>
    </form>
  );
}
