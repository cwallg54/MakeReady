import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { hasTotp, listCredentials, remainingRecoveryCodes, userHasMfa } from "@/lib/mfa/service";
import { fmtDate } from "@/lib/format";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { TotpEnroll } from "@/components/mfa/totp-enroll";
import { PasskeyManager } from "@/components/mfa/passkey-manager";
import { RecoveryCodes } from "@/components/mfa/recovery-codes";

export const dynamic = "force-dynamic";

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ enrolled?: string }> }) {
  const user = await requireUser();
  const { enrolled } = await searchParams;
  const [totpOn, creds, recovery, mfaOn, settings] = await Promise.all([
    hasTotp(user.id),
    listCredentials(user.id),
    remainingRecoveryCodes(user.id),
    userHasMfa(user.id),
    db.query.systemSettings.findFirst(),
  ]);
  // A required, not-yet-enrolled user was sent here to finish activating.
  const mustEnroll = !!settings?.requireMfa && !mfaOn;
  const justEnrolled = mfaOn && !!enrolled;

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Security"
        description="Protect your account with two-factor authentication."
        action={
          mfaOn
            ? <Link href="/dashboard" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Continue to MakeReady →</Link>
            : <Link href="/account/scheduling" className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Scheduling →</Link>
        }
      />

      {mustEnroll ? (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p className="font-semibold">One more step to finish setting up your account.</p>
          <p className="mt-1 text-blue-800">Your organization requires two-factor authentication. Add a method below — an authenticator app or a passkey — and you&apos;ll go straight into MakeReady.</p>
        </div>
      ) : (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            mfaOn ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {justEnrolled
            ? "✓ Two-factor authentication is on — you're all set. Click “Continue to MakeReady” above."
            : mfaOn
            ? "Two-factor authentication is ON for your account."
            : "Two-factor authentication is OFF. Add a method below to secure your account."}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Authenticator app (TOTP)</h2>
          <p className="mb-3 text-sm text-neutral-500">Time-based codes from an app like Google Authenticator, Authy, or 1Password.</p>
          <TotpEnroll enrolled={totpOn} />
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Passkeys &amp; security keys (FIDO2 / WebAuthn)</h2>
          <p className="mb-3 text-sm text-neutral-500">Sign in with Face ID / Touch ID, a device passkey, or a hardware key like YubiKey.</p>
          <PasskeyManager credentials={creds.map((c) => ({ id: c.id, deviceName: c.deviceName, createdAt: fmtDate(c.createdAt) }))} />
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Recovery codes</h2>
          <RecoveryCodes remaining={recovery} />
        </Card>
      </div>
    </div>
  );
}
