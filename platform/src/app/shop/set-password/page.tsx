import Link from "next/link";
import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-16">
      <h1 className="text-2xl font-bold text-neutral-900">Set your password</h1>
      {token ? (
        <>
          <p className="mt-1 mb-5 text-sm text-neutral-500">Choose a password to activate your customer portal — where you can view your quotes, orders, and invoices.</p>
          <SetPasswordForm token={token} />
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">This link is missing its token. Please use the link from your invitation email, or <Link href="/shop/login" className="text-brand-ink underline">sign in</Link> if you already have an account.</p>
      )}
    </div>
  );
}
