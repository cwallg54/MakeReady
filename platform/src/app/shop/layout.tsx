import Link from "next/link";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { cartDetails } from "@/lib/store/cart";
import { getStoreSettings } from "@/lib/store/settings";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [customer, settings] = await Promise.all([getCurrentCustomer(), getStoreSettings()]);
  const { count } = await cartDetails(!!customer);

  // Master switch: when the store is closed, show a simple notice for everyone.
  if (!settings.enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 text-center">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/makeready-logo.png" alt={settings.storeName} className="mx-auto mb-6 h-12 w-auto" />
          <h1 className="text-xl font-bold text-neutral-900">The store is currently closed</h1>
          <p className="mt-1 text-sm text-neutral-500">Please check back soon.{settings.contactEmail ? ` Questions? ${settings.contactEmail}` : ""}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/shop" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/makeready-logo.png" alt="MakeReady by G54" className="h-9 w-auto" />
          </Link>
          <form action="/shop" className="ml-2 hidden flex-1 sm:block">
            <input name="q" placeholder="Search the store…" className="w-full max-w-md rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand" />
          </form>
          <nav className="ml-auto flex items-center gap-3 text-sm">
            {customer ? (
              <Link href="/shop/account" className="font-medium text-neutral-700 hover:text-neutral-900">Hi, {customer.name.split(" ")[0]}</Link>
            ) : (
              <Link href="/shop/login" className="font-medium text-neutral-700 hover:text-neutral-900">Sign in</Link>
            )}
            <Link href="/shop/cart" className="relative rounded-md bg-neutral-900 px-3 py-1.5 font-semibold text-white hover:bg-neutral-700">
              Cart{count > 0 ? <span className="ml-1 rounded-full bg-[#8DC63F] px-1.5 text-xs font-bold text-neutral-900">{count}</span> : ""}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-neutral-400">
          {settings.storeName} · {customer ? "Business Partner store — you're seeing your account pricing." : "Sign in for Business Partner pricing and the full catalog."}
          {settings.tagline ? ` · ${settings.tagline}` : ""}
        </div>
      </footer>
    </div>
  );
}
