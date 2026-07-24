"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type FormState } from "@/lib/auth/actions";
import { Field, SubmitButton } from "@/components/form";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState<FormState, FormData>(forgotPasswordAction, {});

  if (state.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-white">Check your email</h1>
        <p className="text-sm text-neutral-400">
          If an account exists for that address, a password-reset link is on its way. The link
          expires in one hour.
        </p>
        <Link href="/login" className="inline-block text-sm text-neutral-300 hover:text-white">
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Reset password</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>
      <Field label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <SubmitButton>Send reset link</SubmitButton>
      <Link href="/login" className="block text-center text-sm text-neutral-400 hover:text-white">
        ← Back to sign in
      </Link>
    </form>
  );
}
