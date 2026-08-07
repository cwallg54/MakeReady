"use client";

import { useActionState, useState } from "react";
import { draftCustomerEmailAction, type AiState } from "@/lib/ai/actions";

const PURPOSES = [
  { v: "followup", l: "Follow-up" },
  { v: "reengage", l: "Re-engage" },
  { v: "thankyou", l: "Thank you" },
  { v: "quote_nudge", l: "Nudge open quote" },
];

export function AiEmailDraft({ bpId }: { bpId: string }) {
  const [state, action, pending] = useActionState<AiState, FormData>(draftCustomerEmailAction, {});
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="bpId" value={bpId} />
        <select name="purpose" className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-800 outline-none focus:border-brand">
          {PURPOSES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
        <button disabled={pending} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
          {pending ? "Drafting…" : "✨ Draft email"}
        </button>
      </form>
      {state.error && <p className="text-xs text-amber-700">{state.error}</p>}
      {state.text && (
        <div className="rounded-lg border border-blue-200 bg-white p-2">
          <textarea readOnly value={state.text} rows={7} className="w-full resize-y rounded-md border border-neutral-200 bg-neutral-50 p-2 text-sm text-neutral-800 outline-none" />
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(state.text ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="mt-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
          <span className="ml-2 text-[10px] uppercase tracking-wide text-blue-400">AI draft · review before sending</span>
        </div>
      )}
    </div>
  );
}
