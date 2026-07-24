import { and, eq, isNull, count } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { visibleModules, ROLE_LABELS } from "@/lib/rbac";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { type NavItem } from "@/components/app-nav";
import { AppShell } from "@/components/app-shell";
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
    <AppShell
      navItems={items}
      userName={user.name}
      rolesLabel={user.roles.map((r) => ROLE_LABELS[r]).join(", ")}
      initials={initials}
      unreadCount={unread.n}
      logoutSlot={<LogoutButton />}
    >
      {children}
    </AppShell>
  );
}
