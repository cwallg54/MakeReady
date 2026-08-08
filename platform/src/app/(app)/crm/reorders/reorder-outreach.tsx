"use client";

import { useState } from "react";
import { draftReorderOutreachAction } from "@/lib/crm/reorder-actions";

export function ReorderOutreach({ bpId, email }: { bpId: string; email: string | null }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function draft() {
    setState("loading");
    setError("");
    const res = await draftReorderOutreachAction(bpId);
    if (res.ok && res.text) {
      setText(res.text);
      setState("done");
    } else {
      setError(res.error ?? "Couldn’t draft the email.");
      setState("error");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (state === "done") {
    return (
      <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <p className="whitespace-pre-wrap text-xs text-neutral-700">{text}</p>
        <div className="mt-2 flex items-center gap-2">
          <button onClick={copy} className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">{copied ? "Copied" : "Copy"}</button>
          {email && (
            <a href={`mailto:${email}?subject=${encodeURIComponent("Time to reorder?")}&body=${encodeURIComponent(text)}`} className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-neutral-700">Open in email</a>
          )}
          <button onClick={draft} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">Redraft</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1">
      <button
        onClick={draft}
        disabled={state === "loading"}
        className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-brand-ink hover:bg-neutral-50 disabled:opacity-50"
      >
        {state === "loading" ? "Drafting…" : "✨ Draft outreach"}
      </button>
      {state === "error" && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
