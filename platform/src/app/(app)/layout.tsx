import Link from "next/link";
import { and, eq, isNull, count } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { visibleModules, ROLE_LABELS } from "@/lib/rbac";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { LogoInline } from "@/components/logo";
import { AppNav, type NavItem } from "@/components/app-nav";
import { LogoutButton } from "@/components/logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const items: NavItem[] = visibleModules(user.roles).map((m) => ({
    key: m.key,
    label: m.label,
    href: m.phase1 ? m.href : `/module/${m.key}`,
    phase1: m.phase1,
  }));

  const [unread] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col bg-neutral-950 text-neutral-100">
        <div className="border-b border-neutral-800 px-4 py-4">
          <LogoInline className="text-white" />
        </div>
        <AppNav items={items} />
        <div className="border-t border-neutral-800 px-4 py-3">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-neutral-500">
            {user.roles.map((r) => ROLE_LABELS[r]).join(", ")}
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-2 border-b border-neutral-200 bg-white px-6 py-3">
          <Link
            href="/notifications"
            className="relative rounded-md px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            Notifications
            {unread.n > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {unread.n}
              </span>
            )}
          </Link>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
            {initials}
          </span>
          <LogoutButton />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
