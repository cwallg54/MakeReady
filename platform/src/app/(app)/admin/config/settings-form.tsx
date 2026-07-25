"use client";

import { useActionState } from "react";
import { updateSettingsAction, type AdminState } from "@/lib/admin/actions";
import { AdminField, AdminSelect, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function SettingsForm({
  companyName,
  legalName,
  timezone,
  fiscalYearStartMonth,
  sessionTimeoutMinutes,
  requireMfa,
}: {
  companyName: string;
  legalName: string;
  timezone: string;
  fiscalYearStartMonth: number;
  sessionTimeoutMinutes: number;
  requireMfa: boolean;
}) {
  const [state, action] = useActionState<AdminState, FormData>(updateSettingsAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.ok && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Configuration saved.</p>
      )}
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Company name" name="companyName" required defaultValue={companyName} />
        <AdminField label="Legal name" name="legalName" defaultValue={legalName} />
        <AdminField label="Timezone" name="timezone" required defaultValue={timezone} hint="IANA name, e.g. America/Denver" />
        <AdminSelect
          label="Fiscal year starts"
          name="fiscalYearStartMonth"
          defaultValue={fiscalYearStartMonth}
          options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
        />
        <AdminField
          label="Session timeout (minutes)"
          name="sessionTimeoutMinutes"
          type="number"
          min={5}
          max={1440}
          required
          defaultValue={sessionTimeoutMinutes}
          hint="Idle timeout before sign-out"
        />
      </div>
      <label className="flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
        <input type="checkbox" name="requireMfa" defaultChecked={requireMfa} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="font-medium text-neutral-900">Require two-factor authentication</span> — every active user must enroll a
          second factor before accessing the app.
        </span>
      </label>
      <AdminSubmit>Save configuration</AdminSubmit>
    </form>
  );
}
