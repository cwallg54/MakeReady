import { requireUser } from "@/lib/auth/guards";
import { hasTotp, listCredentials, remainingRecoveryCodes, userHasMfa } from "@/lib/mfa/service";
import { fmtDate } from "@/lib/format";
import { PageHeader, Card } from "@/components/ui";
import { TotpEnroll } from "@/components/mfa/totp-enroll";
import { PasskeyManager } from "@/components/mfa/passkey-manager";
import { RecoveryCodes } from "@/components/mfa/recovery-codes";

export default async function SecurityPage() {
  const user = await requireUser();
  const [totpOn, creds, recovery, mfaOn] = await Promise.all([
    hasTotp(user.id),
    listCredentials(user.id),
    remainingRecoveryCodes(user.id),
    userHasMfa(user.id),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader title="Security" description="Protect your account with two-factor authentication." />

      <div
        className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
          mfaOn ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        {mfaOn ? "Two-factor authentication is ON for your account." : "Two-factor authentication is OFF. Add a method below to secure your account."}
      </div>

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
