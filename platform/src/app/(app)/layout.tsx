import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, isNull, count } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { visibleModules, canView, ROLE_LABELS } from "@/lib/rbac";
import { db } from "@/db";
import { notifications, systemSettings } from "@/db/schema";
import { type NavItem } from "@/components/app-nav";
import { AppShell } from "@/components/app-shell";
import { LogoutButton } from "@/components/logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Org-wide policy: if MFA is required and the user hasn't enrolled, force them
  // to the security page until they set up a second factor.
  if (!user.mfaEnabled) {
    const settings = await db.query.systemSettings.findFirst();
    if (settings?.requireMfa) {
      const path = (await headers()).get("x-pathname") ?? "";
      if (!path.startsWith("/account/security")) redirect("/account/security");
    }
  }

  const items: NavItem[] = visibleModules(user.roles).map((m) => ({
    key: m.key,
    label: m.label,
    href: m.phase1 ? m.href : `/module/${m.key}`,
    phase1: m.phase1,
  }));
  // Team calendar isn't a module — add it to the nav for anyone who can see Sales.
  if (canView(user.roles, "sales")) {
    const salesIdx = items.findIndex((i) => i.key === "sales");
    const calItem = { key: "calendar", label: "Calendar", href: "/calendar", phase1: true };
    if (salesIdx >= 0) items.splice(salesIdx + 1, 0, calItem);
    else items.push(calItem);
  }

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
