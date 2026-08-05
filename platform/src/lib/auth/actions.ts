"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  login,
  destroyCurrentSession,
  createPasswordReset,
  resetPassword,
  getCurrentUser,
  establishSession,
  needsMfaEnrollment,
} from "./service";
import { sendPasswordResetEmail } from "@/lib/email";
import { consumeRateLimit, clientIp, retryMessage } from "@/lib/security/rate-limit";

export interface FormState {
  error?: string;
  ok?: boolean;
  fieldErrors?: string[];
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.union([z.literal("on"), z.null()]).optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    rememberMe: formData.get("rememberMe"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  // Per-IP throttle on top of the per-account lockout, to blunt distributed
  // credential-stuffing across many accounts from one source.
  const ip = await clientIp();
  const rl = await consumeRateLimit("login", ip, 30, 300);
  if (!rl.ok) return { error: `Too many sign-in attempts. ${retryMessage(rl.retryAfterSec)}` };

  const result = await login(parsed.data.email, parsed.data.password, parsed.data.rememberMe === "on");
  if (!result.ok) {
    if (result.error === "locked") {
      return { error: "Your account is locked. Contact your administrator." };
    }
    return { error: "Invalid email or password." };
  }
  if (result.mfaRequired) redirect("/login/mfa");
  if (result.mustReset) redirect("/reset-required");
  // Enroll-MFA users go straight to the security page — one redirect, so the
  // client soft-navigation doesn't hit a nested layout redirect (blank screen).
  if (result.enrollMfa) redirect("/account/security");
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}

const emailSchema = z.object({ email: z.string().email() });

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  // Throttle by IP to prevent reset-email bombing and enumeration probing.
  // Still report generic success regardless — never reveal whether an email exists.
  const ip = await clientIp();
  const rl = await consumeRateLimit("pwreset", ip, 5, 3600);
  if (rl.ok && parsed.success) {
    const link = await createPasswordReset(parsed.data.email);
    if (link) await sendPasswordResetEmail(link.email, link.url);
  }
  return { ok: true };
}

const resetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(1),
    confirm: z.string().min(1),
  })
  .refine((d) => d.password === d.confirm, { message: "Passwords do not match" });

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const result = await resetPassword(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    if (result.error === "weak_password") {
      return { error: "Password does not meet requirements.", fieldErrors: result.details };
    }
    if (result.error === "expired") return { error: "This reset link has expired. Request a new one." };
    return { error: "This reset link is invalid. Request a new one." };
  }
  redirect("/login?reset=1");
}

/** Forced password change for a logged-in user (mustResetPassword). Uses the reset pipeline via a fresh token. */
export async function forcedResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password !== confirm) return { error: "Passwords do not match." };

  const link = await createPasswordReset(user.email);
  if (!link) return { error: "Unable to reset password. Contact your administrator." };
  const token = new URL(link.url).searchParams.get("token")!;
  const result = await resetPassword(token, password);
  if (!result.ok) {
    if (result.error === "weak_password") {
      return { error: "Password does not meet requirements.", fieldErrors: result.details };
    }
    return { error: "Unable to reset password. Try again." };
  }
  // resetPassword cleared all sessions; start a fresh one so the user goes straight in.
  await establishSession(user.id);
  // Same one-redirect rule: if they still need to enroll MFA, go there directly.
  if (await needsMfaEnrollment(user.id)) redirect("/account/security");
  redirect("/dashboard");
}
