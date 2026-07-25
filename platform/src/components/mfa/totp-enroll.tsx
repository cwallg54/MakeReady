"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { startTotpEnrollmentAction, confirmTotpEnrollmentAction, disableTotpAction, type MfaState } from "@/lib/mfa/actions";
import { ConfirmButton } from "@/components/confirm-button";

export function TotpEnroll({ enrolled }: { enrolled: boolean }) {
  const [enrollment, setEnrollment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [confirmState, confirmAction] = useActionState<MfaState, FormData>(confirmTotpEnrollmentAction, {});
  const [busy, setBusy] = useState(false);

  if (enrolled) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-emerald-700">✓ Authenticator app enabled</span>
        <form action={disableTotpAction}>
          <ConfirmButton message="Disable your authenticator app?" className="text-sm text-red-600 hover:text-red-800">
            Disable
          </ConfirmButton>
        </form>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <button
        onClick={async () => {
          setBusy(true);
          try {
            setEnrollment(await startTotpEnrollmentAction());
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60"
      >
        {busy ? "Preparing…" : "Set up authenticator app"}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">Scan this QR code in your authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code.</p>
      <Image src={enrollment.qrDataUrl} alt="TOTP QR code" width={160} height={160} className="rounded border border-neutral-200" unoptimized />
      <p className="text-xs text-neutral-500">Can&apos;t scan? Enter this key manually: <code className="rounded bg-neutral-100 px-1.5 py-0.5">{enrollment.secret}</code></p>
      <form action={confirmAction} className="flex items-end gap-2">
        {confirmState.error && <span className="text-sm text-red-600">{confirmState.error}</span>}
        <input name="code" required autoComplete="one-time-code" placeholder="123456" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500" />
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Verify &amp; enable</button>
      </form>
    </div>
  );
}
