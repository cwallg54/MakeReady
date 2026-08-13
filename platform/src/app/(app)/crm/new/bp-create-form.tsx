"use client";

import { useActionState } from "react";
import { createBusinessPartnerAction, type CrmState } from "@/lib/crm/actions";
import { ocrBusinessCardAction, type OcrState } from "@/lib/crm/ocr-actions";
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
  const [ocr, ocrAction, ocrPending] = useActionState<OcrState, FormData>(ocrBusinessCardAction, {});
  const f = ocr.fields ?? {};
  return (
    <>
      <div className="mb-5 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3">
        <form action={ocrAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="text-sm">
            <span className="font-semibold text-neutral-800">📇 Scan a business card</span>
            <span className="ml-1 text-neutral-500">— snap it and we&rsquo;ll fill in the details below.</span>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <input type="file" name="card" accept="image/*" capture="environment" className="text-sm text-neutral-700" />
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">{ocrPending ? "Reading…" : "Scan"}</button>
          </div>
        </form>
        {ocr.error && <p className="mt-2 text-sm text-red-600">{ocr.error}</p>}
        {ocr.fields && <p className="mt-2 text-sm text-green-700">Filled from the card — review and adjust below, then create.</p>}
      </div>
      <form key={ocr.nonce ?? "blank"} action={action} className="space-y-5">
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
          <AdminField label="Company name" name="companyName" required defaultValue={f.companyName} />
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
          <AdminSelect
            label="Send financial application"
            name="paymentApp"
            defaultValue=""
            options={[
              { value: "", label: "— None for now —" },
              { value: "terms_application", label: "Terms / Credit Application (Net 30)" },
              { value: "credit_card_application", label: "Credit Card Application" },
            ]}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900">Primary contact</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Contact name" name="primaryContactName" required defaultValue={f.primaryContactName} />
          <AdminField label="Contact email" name="primaryContactEmail" type="email" required defaultValue={f.primaryContactEmail} />
          <AdminField label="Phone" name="phone" defaultValue={f.phone} />
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900">Address</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Street" name="addressStreet" defaultValue={f.addressStreet} />
          <AdminField label="City" name="addressCity" defaultValue={f.addressCity} />
          <AdminField label="State" name="addressState" defaultValue={f.addressState} />
          <AdminField label="ZIP" name="addressZip" defaultValue={f.addressZip} />
        </div>
      </section>

      {showFinance && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Terms</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Credit limit" name="creditLimit" type="number" />
            <AdminSelect
              label="Payment terms"
              name="paymentTerms"
              defaultValue="Net 30"
              options={[
                { value: "Net 30", label: "Net 30" },
                { value: "Prepay (Credit Card)", label: "Prepay (Credit Card)" },
              ]}
            />
          </div>
          <AdminField label="Internal notes" name="internalNotes" />
        </section>
      )}

      <AdminSubmit>Create Business Partner</AdminSubmit>
      </form>
    </>
  );
}
