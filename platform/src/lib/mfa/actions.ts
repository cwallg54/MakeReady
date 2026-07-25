"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/db";
import { users, mfaTotp, webauthnCredentials } from "@/db/schema";
import { getCurrentUser, getMfaPendingUserId, completeMfaLogin } from "@/lib/auth/service";
import { audit } from "@/lib/audit";
import {
  beginTotpEnrollment,
  confirmTotp,
  verifyTotp,
  verifyRecoveryCode,
  regenerateRecoveryCodes,
  refreshMfaFlag,
  webauthnRegistrationOptions,
  webauthnVerifyRegistration,
  webauthnAuthenticationOptions,
  webauthnVerifyAuthentication,
} from "./service";

const CHAL_COOKIE = "mr_wa_chal";

async function rpConfig() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { rpID: host.split(":")[0], origin: `${proto}://${host}` };
}

async function setChallenge(challenge: string) {
  (await cookies()).set(CHAL_COOKIE, challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
}
async function takeChallenge(): Promise<string | null> {
  const store = await cookies();
  const c = store.get(CHAL_COOKIE)?.value ?? null;
  store.delete(CHAL_COOKIE);
  return c;
}

export interface MfaState {
  error?: string;
}

// ---- Login challenge ------------------------------------------------------

export async function verifyTotpLoginAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const uid = await getMfaPendingUserId();
  if (!uid) redirect("/login");
  const user = await db.query.users.findFirst({ where: eq(users.id, uid) });
  if (!user) redirect("/login");
  const code = String(formData.get("code") ?? "");
  if (!(await verifyTotp(uid, user.email, code))) return { error: "Invalid code. Try again." };
  await completeMfaLogin();
  redirect("/dashboard");
}

export async function verifyRecoveryLoginAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const uid = await getMfaPendingUserId();
  if (!uid) redirect("/login");
  const code = String(formData.get("code") ?? "");
  if (!(await verifyRecoveryCode(uid, code))) return { error: "Invalid or already-used recovery code." };
  await audit({ userId: uid, action: "auth.recovery_used", entityType: "user", entityId: uid });
  await completeMfaLogin();
  redirect("/dashboard");
}

export async function webauthnLoginOptionsAction() {
  const uid = await getMfaPendingUserId();
  if (!uid) return null;
  const { rpID } = await rpConfig();
  const options = await webauthnAuthenticationOptions(uid, rpID);
  await setChallenge(options.challenge);
  return options;
}

export async function webauthnLoginVerifyAction(response: AuthenticationResponseJSON): Promise<{ ok: boolean }> {
  const uid = await getMfaPendingUserId();
  if (!uid) return { ok: false };
  const challenge = await takeChallenge();
  if (!challenge) return { ok: false };
  const { rpID, origin } = await rpConfig();
  const ok = await webauthnVerifyAuthentication(uid, response, challenge, rpID, origin);
  if (!ok) return { ok: false };
  await completeMfaLogin();
  return { ok: true };
}

// ---- Enrollment (account settings) ----------------------------------------

export async function startTotpEnrollmentAction() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return beginTotpEnrollment(user.id, user.email);
}

export async function confirmTotpEnrollmentAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const code = String(formData.get("code") ?? "");
  if (!(await confirmTotp(user.id, user.email, code))) return { error: "That code didn't match. Try again." };
  await audit({ userId: user.id, action: "mfa.totp_enrolled", entityType: "user", entityId: user.id });
  redirect("/account/security?enrolled=totp");
}

export async function disableTotpAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await db.delete(mfaTotp).where(eq(mfaTotp.userId, user.id));
  await refreshMfaFlag(user.id);
  await audit({ userId: user.id, action: "mfa.totp_disabled", entityType: "user", entityId: user.id });
  redirect("/account/security");
}

export async function webauthnRegisterOptionsAction() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { rpID } = await rpConfig();
  const options = await webauthnRegistrationOptions(user.id, user.email, user.name, rpID);
  await setChallenge(options.challenge);
  return options;
}

export async function webauthnRegisterVerifyAction(
  response: RegistrationResponseJSON,
  deviceName: string,
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const challenge = await takeChallenge();
  if (!challenge) return { ok: false };
  const { rpID, origin } = await rpConfig();
  const ok = await webauthnVerifyRegistration(user.id, response, challenge, rpID, origin, deviceName);
  if (ok) await audit({ userId: user.id, action: "mfa.passkey_added", entityType: "user", entityId: user.id });
  return { ok };
}

export async function removeCredentialAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  await db.delete(webauthnCredentials).where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, user.id)));
  await refreshMfaFlag(user.id);
  await audit({ userId: user.id, action: "mfa.passkey_removed", entityType: "user", entityId: user.id });
  redirect("/account/security");
}

export async function regenerateRecoveryCodesAction(): Promise<{ codes: string[] }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const codes = await regenerateRecoveryCodes(user.id);
  await audit({ userId: user.id, action: "mfa.recovery_regenerated", entityType: "user", entityId: user.id });
  return { codes };
}
