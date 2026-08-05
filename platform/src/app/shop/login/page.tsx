import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { LoginForm } from "../auth-forms";

export const dynamic = "force-dynamic";

export default async function ShopLoginPage({ searchParams }: { searchParams: Promise<{ registered?: string }> }) {
  if (await getCurrentCustomer()) redirect("/shop/account");
  const { registered } = await searchParams;

  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      <h1 className="text-xl font-bold text-neutral-900">Business Partner sign in</h1>
      {registered && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Thanks — your account request is in. We'll email you once it's approved, then you can sign in.</div>}
      <LoginForm />
      <p className="text-sm text-neutral-500">New here? <Link href="/shop/register" className="font-medium text-brand-ink hover:underline">Request an account</Link></p>
      <p className="text-xs text-neutral-400"><Link href="/shop" className="hover:underline">← Back to the store</Link> · You can browse and buy in-stock items without an account.</p>
    </div>
  );
}
