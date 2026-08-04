import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { Logo } from "@/components/logo";
import { ForcedResetForm } from "./forced-reset-form";

export default async function ResetRequiredPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustResetPassword) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 text-white" markClassName="h-20 w-auto" />
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-white">Update your password</h1>
          <p className="mt-1 mb-4 text-sm text-neutral-400">
            Your administrator requires you to set a new password before continuing.
          </p>
          <ForcedResetForm />
        </div>
      </div>
    </div>
  );
}
