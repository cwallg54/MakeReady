import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { RegisterForm } from "../auth-forms";

export const dynamic = "force-dynamic";

export default async function ShopRegisterPage() {
  if (await getCurrentCustomer()) redirect("/shop/account");
  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <h1 className="text-xl font-bold text-neutral-900">Request a Business Partner account</h1>
      <p className="text-sm text-neutral-500">Get account pricing and the full catalog. Approval is quick.</p>
      <RegisterForm />
      <p className="text-sm text-neutral-500">Already have an account? <Link href="/shop/login" className="font-medium text-brand-ink hover:underline">Sign in</Link></p>
    </div>
  );
}
