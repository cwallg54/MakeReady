import { redirect } from "next/navigation";
import { getMfaPendingUserId } from "@/lib/auth/service";
import { hasTotp, hasWebauthn } from "@/lib/mfa/service";
import { MfaChallengeForm } from "./mfa-challenge-form";

export default async function MfaChallengePage() {
  const uid = await getMfaPendingUserId();
  if (!uid) redirect("/login");
  const [totp, webauthn] = await Promise.all([hasTotp(uid), hasWebauthn(uid)]);
  return <MfaChallengeForm hasTotp={totp} hasWebauthn={webauthn} />;
}
