"use client";

import { useActionState } from "react";
import { saveProfileAction, type SchedState } from "@/lib/scheduling/actions";
import { AdminField, AdminSubmit } from "@/components/admin-form";
import { FormError } from "@/components/form";

export function ProfileForm({
  slug,
  timezone,
  active,
  minNoticeHours,
  slotIntervalMin,
  bookingWindowDays,
}: {
  slug: string;
  timezone: string;
  active: boolean;
  minNoticeHours: number;
  slotIntervalMin: number;
  bookingWindowDays: number;
}) {
  const [state, action] = useActionState<SchedState, FormData>(saveProfileAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.ok && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Saved.</p>}
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Booking link slug" name="slug" defaultValue={slug} hint="Your public URL: /schedule/<slug>" />
        <AdminField label="Timezone" name="timezone" defaultValue={timezone} hint="IANA, e.g. America/Denver" />
        <AdminField label="Min notice (hours)" name="minNoticeHours" type="number" defaultValue={minNoticeHours} />
        <AdminField label="Slot interval (min)" name="slotIntervalMin" type="number" defaultValue={slotIntervalMin} />
        <AdminField label="Booking window (days)" name="bookingWindowDays" type="number" defaultValue={bookingWindowDays} />
      </div>
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="active" defaultChecked={active} className="h-4 w-4" /> Accept public bookings
      </label>
      <AdminSubmit>Save booking settings</AdminSubmit>
    </form>
  );
}
