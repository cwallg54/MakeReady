"use client";

import { useRef, useState, useTransition } from "react";
import { suggestBillAccountAction } from "@/lib/ai/actions";

const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";

type Account = { id: string; code: string; name: string };

/** The bill add-line row, with an AI "suggest GL account" helper. Renders the
 *  named inputs directly inside the parent <form action={addBillLineAction}>. */
export function AddBillLine({ accounts, defaultAccountId }: { accounts: Account[]; defaultAccountId: string }) {
  const descRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function suggest() {
    const description = descRef.current?.value.trim() ?? "";
    setHint(null);
    setError(null);
    if (!description) { setError("Enter a description first."); return; }
    start(async () => {
      const fd = new FormData();
      fd.set("description", description);
      const res = await suggestBillAccountAction({}, fd);
      if (res.error || !res.code) { setError(res.error ?? "No confident match — pick manually."); return; }
      const match = accounts.find((a) => a.code === res.code);
      if (!match) { setError("No confident match — pick manually."); return; }
      setAccountId(match.id);
      setHint(`${res.code} · ${res.name}${res.reason ? ` — ${res.reason}` : ""}`);
    });
  }

  return (
    <>
      <div className="sm:col-span-4">
        <input ref={descRef} name="description" required placeholder="Description" className={inp} />
      </div>
      <div className="sm:col-span-4">
        <div className="flex gap-1">
          <select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inp}>
            <option value="">— account —</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </select>
          <button type="button" onClick={suggest} disabled={pending} title="Suggest an account with AI" className="shrink-0 rounded-md border border-blue-200 bg-white px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-60">
            {pending ? "…" : "✨"}
          </button>
        </div>
      </div>
      <input name="qty" type="number" step="0.01" min="0" defaultValue="1" className={`sm:col-span-1 ${inp}`} />
      <input name="unitPrice" type="number" step="0.01" min="0" placeholder="0.00" className={`sm:col-span-2 ${inp}`} />
      <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 sm:col-span-1">Add</button>
      {(hint || error) && (
        <p className={`sm:col-span-12 text-xs ${error ? "text-amber-700" : "text-blue-600"}`}>
          {error ?? `AI suggests ${hint} · verify before posting`}
        </p>
      )}
    </>
  );
}
