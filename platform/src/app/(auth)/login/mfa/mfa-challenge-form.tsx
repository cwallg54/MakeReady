"use client";

import { useActionState, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  verifyTotpLoginAction,
  verifyRecoveryLoginAction,
  webauthnLoginOptionsAction,
  webauthnLoginVerifyAction,
  type MfaState,
} from "@/lib/mfa/actions";
import { Field, SubmitButton, FormError } from "@/components/form";

export function MfaChallengeForm({ hasTotp, hasWebauthn }: { hasTotp: boolean; hasWebauthn: boolean }) {
  const [totpState, totpAction] = useActionState<MfaState, FormData>(verifyTotpLoginAction, {});
  const [recoveryState, recoveryAction] = useActionState<MfaState, FormData>(verifyRecoveryLoginAction, {});
  const [showRecovery, setShowRecovery] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function usePasskey() {
    setPasskeyError(undefined);
    setBusy(true);
    try {
      const options = await webauthnLoginOptionsAction();
      if (!options) throw new Error("Session expired. Sign in again.");
      const response = await startAuthentication({ optionsJSON: options });
      const result = await webauthnLoginVerifyAction(response);
      if (result.ok) window.location.href = "/dashboard";
      else setPasskeyError("Passkey verification failed. Try again or use a code.");
    } catch {
      setPasskeyError("Couldn't verify your passkey. Try again or use a code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Two-factor authentication</h1>
        <p className="mt-1 text-sm text-neutral-400">Confirm it&apos;s you to finish signing in.</p>
      </div>

      {hasWebauthn && (
        <div className="space-y-2">
          {passkeyError && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{passkeyError}</p>}
          <button
            onClick={usePasskey}
            disabled={busy}
            className="w-full rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-60"
          >
            {busy ? "Waiting for passkey…" : "Use a passkey / security key"}
          </button>
          {hasTotp && <p className="text-center text-xs text-neutral-500">or enter a code below</p>}
        </div>
      )}

      {hasTotp && !showRecovery && (
        <form action={totpAction} className="space-y-3">
          <FormError message={totpState.error} />
          <Field label="Authenticator code" name="code" autoComplete="one-time-code" required autoFocus />
          <SubmitButton>Verify</SubmitButton>
        </form>
      )}

      {showRecovery ? (
        <form action={recoveryAction} className="space-y-3">
          <FormError message={recoveryState.error} />
          <Field label="Recovery code" name="code" required autoFocus />
          <SubmitButton>Use recovery code</SubmitButton>
          <button type="button" onClick={() => setShowRecovery(false)} className="block w-full text-center text-sm text-neutral-400 hover:text-white">
            ← Back
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowRecovery(true)} className="block w-full text-center text-sm text-neutral-400 hover:text-white">
          Use a recovery code instead
        </button>
      )}
    </div>
  );
}
