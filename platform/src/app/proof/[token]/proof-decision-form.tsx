"use client";

import { useActionState } from "react";
import { submitProofDecisionAction, type ProofDecisionState } from "@/lib/orders/proof-actions";

const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

export function ProofDecisionForm({ token }: { token: string }) {
  const [state, action] = useActionState<ProofDecisionState, FormData>(submitProofDecisionAction, {});

  if (state.done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-emerald-900">Thank you — your response was recorded.</h2>
        <p className="mt-1 text-sm text-emerald-800">Great Mountain West has been notified. You can close this page.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      <label className="block text-sm font-medium text-neutral-700">
        Your name (signature) *
        <input name="signedName" required placeholder="Type your full name" className={`mt-1 ${input}`} />
      </label>
      <label className="block text-sm font-medium text-neutral-700">
        Notes / requested changes
        <textarea name="notes" rows={3} placeholder="Required if requesting changes or declining" className={`mt-1 ${input}`} />
      </label>

      <div className="grid gap-2 sm:grid-cols-3">
        <button name="decision" value="approve" className="rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700">✓ Approve</button>
        <button name="decision" value="changes" className="rounded-md bg-amber-500 px-4 py-3 text-sm font-semibold text-white hover:bg-amber-600">✎ Request changes</button>
        <button name="decision" value="decline" className="rounded-md border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-50">✕ Decline</button>
      </div>
      <p className="text-center text-xs text-neutral-400">By approving you confirm the artwork is correct — spelling, colors, sizes, and placement. Your name, the date, and your network address are recorded with this decision.</p>
    </form>
  );
}
