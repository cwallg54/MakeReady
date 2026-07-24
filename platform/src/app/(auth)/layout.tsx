import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 text-neutral-100">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 text-white" markClassName="h-12 w-auto" showTagline />
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-6 shadow-xl">
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-neutral-500">
          MakeReady by G54 · Commercial Print &amp; Production
        </p>
      </div>
    </div>
  );
}
