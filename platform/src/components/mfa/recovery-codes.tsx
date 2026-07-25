"use client";

import { useState } from "react";
import { regenerateRecoveryCodesAction } from "@/lib/mfa/actions";

export function RecoveryCodes({ remaining }: { remaining: number }) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  function download() {
    if (!codes) return;
    const blob = new Blob([`MakeReady recovery codes\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "makeready-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      {codes ? (
        <div className="space-y-2">
          <p className="text-sm text-neutral-600">Save these somewhere safe. Each code works once, and this is the only time they&apos;re shown.</p>
          <ul className="grid grid-cols-2 gap-1 rounded-md bg-neutral-50 p-3 font-mono text-sm text-neutral-800">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button onClick={download} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
            Download .txt
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            {remaining > 0 ? `${remaining} unused recovery codes remain.` : "No recovery codes yet."} Recovery codes let you sign in if you lose your authenticator and passkeys.
          </p>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                const r = await regenerateRecoveryCodesAction();
                setCodes(r.codes);
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
          >
            {busy ? "Generating…" : remaining > 0 ? "Regenerate codes" : "Generate recovery codes"}
          </button>
        </>
      )}
    </div>
  );
}
