"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface MobileTab {
  key: string;
  label: string;
  href: string;
  /** Icon path drawn inside a 24x24 stroke SVG. */
  icon: React.ReactNode;
  /** Elevated center action (e.g. New). */
  primary?: boolean;
}

// Field-sales bottom navigation. Rendered only below the `lg` breakpoint, so the
// desktop layout is never affected.
export function MobileTabBar({ tabs }: { tabs: MobileTab[] }) {
  const pathname = usePathname() ?? "";

  // Longest matching href wins, so /sales/orders beats /sales, and
  // /sales/quotes/new beats /sales.
  let activeKey = "";
  let bestLen = -1;
  for (const t of tabs) {
    const matches = pathname === t.href || pathname.startsWith(t.href + "/");
    if (matches && t.href.length > bestLen) {
      bestLen = t.href.length;
      activeKey = t.key;
    }
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map((t) => {
          const active = t.key === activeKey;
          if (t.primary) {
            return (
              <li key={t.key} className="flex flex-1 justify-center">
                <Link
                  href={t.href}
                  aria-label={t.label}
                  aria-current={active ? "page" : undefined}
                  className="-mt-5 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg shadow-neutral-900/30 active:scale-95"
                >
                  <span className="h-6 w-6">{t.icon}</span>
                  <span className="text-[10px] font-semibold leading-none">{t.label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={t.key} className="flex flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-neutral-900" : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                <span className={`h-6 w-6 ${active ? "opacity-100" : "opacity-80"}`}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Shared 24x24 stroke icons.
const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
    {children}
  </svg>
);

export const TAB_ICONS = {
  home: svg(<><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /></>),
  accounts: svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6.5a3 3 0 0 1 0 5" /><path d="M18 20a6 6 0 0 0-3-5.2" /></>),
  plus: svg(<><path d="M12 6v12" /><path d="M6 12h12" /></>),
  quotes: svg(<><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></>),
  orders: svg(<><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5" /><path d="M12 12v9" /></>),
} as const;
