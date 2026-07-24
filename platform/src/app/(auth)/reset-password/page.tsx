import Link from "next/link";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold text-white">Invalid link</h1>
        <p className="text-sm text-neutral-400">
          This password-reset link is missing or malformed. Request a new one.
        </p>
        <Link href="/forgot-password" className="inline-block text-sm text-neutral-300 hover:text-white">
          Request a new link
        </Link>
      </div>
    );
  }

  return <ResetForm token={token} />;
}
