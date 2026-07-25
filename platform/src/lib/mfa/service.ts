import "server-only";
import { createHash, randomBytes, randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { db } from "@/db";
import { mfaTotp, webauthnCredentials, recoveryCodes, users } from "@/db/schema";

const ISSUER = "MakeReady";

// ---- TOTP -----------------------------------------------------------------

function totpFor(email: string, secretB32: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretB32),
  });
}

/** Create (or reset) an unconfirmed TOTP secret and return the enrollment QR + key. */
export async function beginTotpEnrollment(userId: string, email: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await db
    .insert(mfaTotp)
    .values({ userId, secret, confirmedAt: null })
    .onConflictDoUpdate({ target: mfaTotp.userId, set: { secret, confirmedAt: null } });
  const uri = totpFor(email, secret).toString();
  const qrDataUrl = await QRCode.toDataURL(uri);
  return { secret, qrDataUrl };
}

export async function confirmTotp(userId: string, email: string, code: string): Promise<boolean> {
  const row = await db.query.mfaTotp.findFirst({ where: eq(mfaTotp.userId, userId) });
  if (!row) return false;
  const delta = totpFor(email, row.secret).validate({ token: code.replace(/\s/g, ""), window: 1 });
  if (delta === null) return false;
  await db.update(mfaTotp).set({ confirmedAt: new Date() }).where(eq(mfaTotp.userId, userId));
  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, userId));
  return true;
}

export async function verifyTotp(userId: string, email: string, code: string): Promise<boolean> {
  const row = await db.query.mfaTotp.findFirst({ where: eq(mfaTotp.userId, userId) });
  if (!row || !row.confirmedAt) return false;
  return totpFor(email, row.secret).validate({ token: code.replace(/\s/g, ""), window: 1 }) !== null;
}

export async function hasTotp(userId: string): Promise<boolean> {
  const row = await db.query.mfaTotp.findFirst({ where: eq(mfaTotp.userId, userId) });
  return !!row?.confirmedAt;
}

// ---- Recovery codes -------------------------------------------------------

function hashCode(raw: string): string {
  return createHash("sha256").update(raw.toLowerCase().replace(/\s|-/g, "")).digest("hex");
}

/** Regenerate a fresh set of recovery codes (invalidates old). Returns plaintext once. */
export async function regenerateRecoveryCodes(userId: string, count = 10): Promise<string[]> {
  const codes = Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex"); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  await db.insert(recoveryCodes).values(codes.map((c) => ({ userId, codeHash: hashCode(c) })));
  return codes;
}

export async function verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
  const row = await db.query.recoveryCodes.findFirst({
    where: and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, hashCode(code)), isNull(recoveryCodes.usedAt)),
  });
  if (!row) return false;
  await db.update(recoveryCodes).set({ usedAt: new Date() }).where(eq(recoveryCodes.id, row.id));
  return true;
}

export async function remainingRecoveryCodes(userId: string): Promise<number> {
  const rows = await db.select().from(recoveryCodes).where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)));
  return rows.length;
}

// ---- WebAuthn (FIDO2 / passkeys) ------------------------------------------

export async function listCredentials(userId: string) {
  return db.select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId));
}

export async function webauthnRegistrationOptions(userId: string, email: string, name: string, rpID: string) {
  const existing = await listCredentials(userId);
  const options = await generateRegistrationOptions({
    rpName: ISSUER,
    rpID,
    userName: email,
    userDisplayName: name,
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: (c.transports ?? undefined) as never })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  return options;
}

export async function webauthnVerifyRegistration(
  userId: string,
  response: Parameters<typeof verifyRegistrationResponse>[0]["response"],
  expectedChallenge: string,
  rpID: string,
  origin: string,
  deviceName: string,
): Promise<boolean> {
  let result: VerifiedRegistrationResponse;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    return false;
  }
  if (!result.verified || !result.registrationInfo) return false;
  const { credential } = result.registrationInfo;
  await db.insert(webauthnCredentials).values({
    id: randomUUID(),
    userId,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    deviceName: deviceName || "Passkey",
  });
  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, userId));
  return true;
}

export async function webauthnAuthenticationOptions(userId: string, rpID: string) {
  const creds = await listCredentials(userId);
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: creds.map((c) => ({ id: c.credentialId, transports: (c.transports ?? undefined) as never })),
    userVerification: "preferred",
  });
}

export async function webauthnVerifyAuthentication(
  userId: string,
  response: Parameters<typeof verifyAuthenticationResponse>[0]["response"],
  expectedChallenge: string,
  rpID: string,
  origin: string,
): Promise<boolean> {
  const cred = await db.query.webauthnCredentials.findFirst({
    where: and(eq(webauthnCredentials.userId, userId), eq(webauthnCredentials.credentialId, response.id)),
  });
  if (!cred) return false;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId,
        publicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: (cred.transports ?? undefined) as never,
      },
      requireUserVerification: false,
    });
    if (!result.verified) return false;
    await db
      .update(webauthnCredentials)
      .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() })
      .where(eq(webauthnCredentials.id, cred.id));
    return true;
  } catch {
    return false;
  }
}

export async function hasWebauthn(userId: string): Promise<boolean> {
  const rows = await listCredentials(userId);
  return rows.length > 0;
}

/** Whether the user has any confirmed second factor. */
export async function userHasMfa(userId: string): Promise<boolean> {
  return (await hasTotp(userId)) || (await hasWebauthn(userId));
}

/** Recompute and persist the users.mfaEnabled flag (call after removing factors). */
export async function refreshMfaFlag(userId: string): Promise<boolean> {
  const enabled = await userHasMfa(userId);
  await db.update(users).set({ mfaEnabled: enabled }).where(eq(users.id, userId));
  return enabled;
}
