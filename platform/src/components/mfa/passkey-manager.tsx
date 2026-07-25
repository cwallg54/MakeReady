"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { webauthnRegisterOptionsAction, webauthnRegisterVerifyAction, removeCredentialAction } from "@/lib/mfa/actions";
import { ConfirmButton } from "@/components/confirm-button";

interface Cred {
  id: string;
  deviceName: string | null;
  createdAt: string;
}

export function PasskeyManager({ credentials }: { credentials: Cred[] }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function addPasskey() {
    setError(undefined);
    setBusy(true);
    try {
      const options = await webauthnRegisterOptionsAction();
      if (!options) throw new Error("session");
      const response = await startRegistration({ optionsJSON: options });
      const result = await webauthnRegisterVerifyAction(response, name.trim() || "Passkey");
      if (result.ok) window.location.reload();
      else setError("Registration failed. Try again.");
    } catch {
      setError("Couldn't register this passkey. Your device may not support it, or you cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {credentials.length === 0 && <li className="text-sm text-neutral-400">No passkeys registered.</li>}
        {credentials.map((c) => (
          <li key={c.id} className="flex items-center justify-between">
            <span className="text-sm text-neutral-800">{c.deviceName ?? "Passkey"} <span className="text-xs text-neutral-400">· added {c.createdAt}</span></span>
            <form action={removeCredentialAction}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmButton message="Remove this passkey?" className="text-sm text-red-600 hover:text-red-800">Remove</ConfirmButton>
            </form>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-end gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Device name (e.g. MacBook, YubiKey)"
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500"
        />
        <button onClick={addPasskey} disabled={busy} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
          {busy ? "Waiting…" : "Add passkey"}
        </button>
      </div>
    </div>
  );
}
