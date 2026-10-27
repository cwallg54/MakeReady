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
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <input type="file" name="card" accept="image/*" capture="environment" className="min-w-0 flex-1 text-sm text-neutral-700" />
            <button className="shrink-0 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 sm:py-1.5">{ocrPending ? "Reading…" : "Scan"}</button>
          </div>
        </form>
        {ocr.error && <p className="mt-2 text-sm text-red-600">{ocr.error}</p>}
        {ocr.fields && <p className="mt-2 text-sm text-green-700">Filled from the card — review and adjust below, then create.</p>}
      </div>
      <form key={ocr.nonce ?? "blank"} action={action} className="space-y-6">
      <FormError message={state.error} />
      {state.duplicate && (
        <label className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <input type="checkbox" name="confirmDuplicate" value="on" className="h-4 w-4" />
          Create anyway (a company with this name already exists)
        </label>
      )}

      <Step n={1} title="Company & primary contact" note="Required">
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="Company name *" name="companyName" required defaultValue={f.companyName} autoComplete="organization" />
          <AdminField label="Contact name *" name="primaryContactName" required defaultValue={f.primaryContactName} autoComplete="name" />
          <AdminField label="Contact email *" name="primaryContactEmail" type="email" required defaultValue={f.primaryContactEmail} autoComplete="email" inputMode="email" />
          <AdminField label="Phone" name="phone" type="tel" defaultValue={f.phone} autoComplete="tel" inputMode="tel" />
        </div>
      </Step>

      <Step n={2} title="Address" note="Main / billing — add shipping addresses on the account">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <AdminField label="Street" name="addressStreet" defaultValue={f.addressStreet} autoComplete="street-address" />
          </div>
          <AdminField label="City" name="addressCity" defaultValue={f.addressCity} autoComplete="address-level2" />
          <div className="grid grid-cols-2 gap-4">
            <AdminField label="State" name="addressState" defaultValue={f.addressState} autoComplete="address-level1" maxLength={2} placeholder="UT" />
            <AdminField label="ZIP" name="addressZip" defaultValue={f.addressZip} autoComplete="postal-code" inputMode="numeric" maxLength={10} />
          </div>
        </div>
      </Step>

      <Step n={3} title="Account setup">
        <div className="grid gap-4 sm:grid-cols-2">
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
            label="Account group"
            name="accountGroupId"
            defaultValue=""
            options={[{ value: "", label: "— None (assign later) —" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
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
          {!scoped && (
            <AdminSelect
              label="Owner"
              name="ownerId"
              defaultValue=""
              options={[{ value: "", label: "— Unassigned —" }, ...owners.map((o) => ({ value: o.id, label: o.name }))]}
            />
          )}
          <div className="sm:col-span-2">
            <AdminField label="Tags" name="tags" hint="Comma-separated, e.g. VIP, screen-print" />
          </div>
        </div>
      </Step>

      <Step n={4} title="Credit & payment">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
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
            <p className="mt-1 text-xs text-neutral-500">Creates a secure link on the account you can copy or email to the customer.</p>
          </div>
          {showFinance && (
            <>
              <AdminField label="Credit limit" name="creditLimit" type="number" inputMode="decimal" />
              <AdminSelect
                label="Payment terms"
                name="paymentTerms"
                defaultValue="Net 30"
                options={[
                  { value: "Net 30", label: "Net 30" },
                  { value: "Prepay (Credit Card)", label: "Prepay (Credit Card)" },
                ]}
              />
              <div className="sm:col-span-2">
                <AdminField label="Internal notes" name="internalNotes" />
              </div>
            </>
          )}
        </div>
      </Step>

      <div className="flex flex-col gap-2 border-t border-neutral-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-500">Next you&rsquo;ll land on the account, where a setup checklist walks through the remaining steps.</p>
        <div className="[&>button]:w-full sm:[&>button]:w-auto">
          <AdminSubmit>Create Business Partner</AdminSubmit>
        </div>
      </div>
      </form>
    </>
  );
}

function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{n}</span>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {note && <span className="text-xs text-neutral-400">{note}</span>}
      </div>
      {children}
    </section>
  );
}
