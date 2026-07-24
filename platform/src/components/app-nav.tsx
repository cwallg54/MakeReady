"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  phase1: boolean;
}

export function AppNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
              active
                ? "bg-white/10 font-semibold text-white"
                : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            }`}
          >
            <span>{item.label}</span>
            {!item.phase1 && (
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-500">
                Soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
