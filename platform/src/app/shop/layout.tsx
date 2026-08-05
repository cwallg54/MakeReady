import Link from "next/link";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { cartDetails } from "@/lib/store/cart";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();
  const { count } = await cartDetails(!!customer);

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
          MakeReady by G54 · {customer ? "Business Partner store" : "Online store"} ·
          {customer ? " You're seeing your account pricing." : " Sign in for Business Partner pricing and the full catalog."}
        </div>
      </footer>
    </div>
  );
}
