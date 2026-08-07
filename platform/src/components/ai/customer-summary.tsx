"use client";

import { useActionState } from "react";
import { summarizeCustomerAction, type AiState } from "@/lib/ai/actions";

export function CustomerSummary({ bpId }: { bpId: string }) {
  const [state, action, pending] = useActionState<AiState, FormData>(summarizeCustomerAction, {});
  return (
    <div className="space-y-2">
      {state.text && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm leading-relaxed text-neutral-800">
          {state.text}
          <p className="mt-1 text-[10px] uppercase tracking-wide text-blue-400">AI summary · verify before acting</p>
        </div>
      )}
      {state.error && <p className="text-xs text-amber-700">{state.error}</p>}
      <form action={action}>
        <input type="hidden" name="bpId" value={bpId} />
        <button disabled={pending} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
          {pending ? "Thinking…" : state.text ? "✨ Regenerate summary" : "✨ AI summary"}
        </button>
      </form>
    </div>
  );
}
