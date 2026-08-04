"use client";

import { useActionState } from "react";
import { bookMeetingAction, type BookState } from "@/lib/scheduling/actions";

const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand";

export function BookingForm({ slug, meetingTypeId, slot, when }: { slug: string; meetingTypeId: string; slot: string; when: string }) {
  const [state, action] = useActionState<BookState, FormData>(bookMeetingAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="meetingTypeId" value={meetingTypeId} />
      <input type="hidden" name="slot" value={slot} />
      <p className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">{when}</p>
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <input name="attendeeName" required placeholder="Your name *" className={input} />
      <input name="attendeeEmail" type="email" placeholder="Email" className={input} />
      <input name="attendeePhone" placeholder="Phone" className={input} />
      <textarea name="notes" rows={2} placeholder="Anything we should know?" className={input} />
      <button type="submit" className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-700">Confirm booking</button>
    </form>
  );
}
