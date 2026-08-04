"use client";

import { useActionState } from "react";
import { createPublicLeadAction, type CrmState } from "@/lib/crm/actions";

const input =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand";

export function LeadForm() {
  const [state, action] = useActionState<CrmState, FormData>(createPublicLeadAction, {});

  if (state.ok) {
    return (
      <div className="text-center">
        <h1 className="text-lg font-semibold text-neutral-900">Thanks — we&apos;ve got it.</h1>
        <p className="mt-2 text-sm text-neutral-600">A member of our team will reach out shortly.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Request a quote</h1>
        <p className="mt-1 text-sm text-neutral-500">Tell us about your project and we&apos;ll be in touch.</p>
      </div>
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      {/* Honeypot (hidden from humans) */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <input name="companyName" required placeholder="Company name" className={input} />
      <input name="contactName" required placeholder="Your name" className={input} />
      <div className="grid grid-cols-2 gap-3">
        <input name="email" type="email" required placeholder="Email" className={input} />
        <input name="phone" placeholder="Phone" className={input} />
      </div>
      <textarea name="message" rows={4} placeholder="What are you looking to produce?" className={input} />
      <input type="hidden" name="source" value="Website" />
      <button type="submit" className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
        Submit request
      </button>
    </form>
  );
}
