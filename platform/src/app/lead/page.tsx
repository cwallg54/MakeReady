import { Logo } from "@/components/logo";
import { LeadForm } from "./lead-form";

// Public, unauthenticated lead-capture page (allowed in proxy.ts).
export default function PublicLeadPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-neutral-900">
          <Logo markClassName="h-16 w-auto" />
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <LeadForm />
        </div>
        <p className="mt-6 text-center text-xs text-neutral-400">MakeReady by G54 · Commercial Print &amp; Production</p>
      </div>
    </div>
  );
}
