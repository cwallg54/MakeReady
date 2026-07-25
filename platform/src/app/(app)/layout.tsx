import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, isNull, count } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { visibleModules, ROLE_LABELS } from "@/lib/rbac";
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

  // Sub-menu definitions: modules that expand into collapsible children.
  const SUBMENUS: Record<string, NavItem[]> = {
    crm: [
      { key: "crm-bp", label: "Business Partners", href: "/crm", phase1: true },
      { key: "crm-pipeline", label: "Pipeline", href: "/crm/pipeline", phase1: true },
    ],
    sales: [
      { key: "sales-quotes", label: "Quotes", href: "/sales", phase1: true },
      { key: "sales-orders", label: "Orders", href: "/sales/orders", phase1: true },
      { key: "sales-automations", label: "Automations", href: "/sales/automations", phase1: true },
      { key: "sales-calendar", label: "Calendar", href: "/calendar", phase1: true },
    ],
  };

  const items: NavItem[] = visibleModules(user.roles).map((m) => {
    const children = m.phase1 ? SUBMENUS[m.key] : undefined;
    return {
      key: m.key,
      label: m.label,
      href: children ? undefined : m.phase1 ? m.href : `/module/${m.key}`,
      phase1: m.phase1,
      children,
    };
  });
  // Help Center — available to everyone.
  items.push({ key: "help", label: "Help", href: "/help", phase1: true });

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
