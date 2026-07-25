"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/account-groups", label: "Account Groups" },
  { href: "/admin/templates", label: "Order Templates" },
  { href: "/admin/config", label: "Configuration" },
  { href: "/admin/audit", label: "Audit Log" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-neutral-200">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              active
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
