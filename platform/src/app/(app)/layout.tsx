import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, isNull, count } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { visibleModules, canView, canEdit, ROLE_LABELS } from "@/lib/rbac";
import { canDoArt } from "@/lib/art/access";
import { db } from "@/db";
import { notifications, systemSettings } from "@/db/schema";
import { type NavItem } from "@/components/app-nav";
import { AppShell } from "@/components/app-shell";
import { LogoutButton } from "@/components/logout-button";
import { TAB_ICONS, type MobileTab, type SpeedDialAction } from "@/components/mobile-tab-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Org-wide policy: if MFA is required and the user hasn't enrolled, force them
  // to the security page until they set up a second factor.
  let mustEnroll = false;
  if (!user.mfaEnabled) {
    const settings = await db.query.systemSettings.findFirst();
    if (settings?.requireMfa) {
      mustEnroll = true;
      const path = (await headers()).get("x-pathname") ?? "";
      // Only redirect when we positively know we're NOT already on the security
      // page. If the pathname header is ever missing, fail open (don't redirect)
      // so this can never loop into a blank screen — enforcement still fires on
      // the normal case where the header is present.
      const onSecurity = path === "" || path.startsWith("/account/security");
      if (!onSecurity) redirect("/account/security");
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
    accounting: [
      { key: "acct-invoices", label: "Invoices", href: "/accounting/invoices", phase1: true },
      { key: "acct-payments", label: "Payments", href: "/accounting/payments", phase1: true },
      { key: "acct-aging", label: "AR Aging", href: "/accounting/aging", phase1: true },
      { key: "acct-statements", label: "Statements", href: "/accounting/statements", phase1: true },
      { key: "acct-credit", label: "Credit Requests", href: "/accounting/credit-requests", phase1: true },
      { key: "acct-chart", label: "Chart of Accounts", href: "/accounting/chart", phase1: true },
    ],
  };

  // The Operations group (Art, Production, Inventory) is rendered as a custom
  // cluster below Sales, so exclude their base modules from the auto list.
  const items: NavItem[] = visibleModules(user.roles)
    .filter((m) => m.key !== "jobs" && m.key !== "inventory")
    .map((m) => {
      const children = m.phase1 ? SUBMENUS[m.key] : undefined;
      return {
        key: m.key,
        label: m.label,
        href: children ? undefined : m.phase1 ? m.href : `/module/${m.key}`,
        phase1: m.phase1,
        children,
      };
    });

  // Operations cluster — placed directly below Sales in the sidebar.
  const ops: NavItem[] = [];
  if (canDoArt(user.roles)) ops.push({ key: "art", label: "Art Department", href: "/art", phase1: true });
  if (canDoArt(user.roles)) ops.push({ key: "designs", label: "Design Library", href: "/designs", phase1: true });
  if (canView(user.roles, "jobs")) ops.push({ key: "production", label: "Production", href: "/production", phase1: true });
  if (canView(user.roles, "inventory")) ops.push({ key: "inventory", label: "Inventory", href: "/inventory", phase1: true });
  if (ops.length) {
    const salesIdx = items.findIndex((i) => i.key === "sales");
    items.splice(salesIdx >= 0 ? salesIdx + 1 : items.length, 0, ...ops);
  }
  // Help Center — available to everyone.
  items.push({ key: "help", label: "Help", href: "/help", phase1: true });

  // Field-sales bottom tabs (mobile only). Gated by module access; the center
  // "New" action starts a quote, the front door to the order process.
  const mobileTabs: MobileTab[] = [{ key: "home", label: "Home", href: "/dashboard", icon: TAB_ICONS.home }];
  if (canView(user.roles, "crm")) mobileTabs.push({ key: "accounts", label: "Accounts", href: "/crm", icon: TAB_ICONS.accounts });

  // Center "New" button: press-and-hold reveals the create actions the rep can start.
  const newActions: SpeedDialAction[] = [];
  if (canEdit(user.roles, "crm")) newActions.push({ key: "new-bp", label: "New Business Partner", href: "/crm/new", icon: TAB_ICONS.userPlus });
  if (canEdit(user.roles, "sales")) newActions.push({ key: "new-quote", label: "New Quote", href: "/sales/quotes/new", icon: TAB_ICONS.quotes });
  if (newActions.length > 0) {
    mobileTabs.push({
      key: "new",
      label: "New",
      href: newActions[0].href,
      icon: TAB_ICONS.plus,
      primary: true,
      actions: newActions.length > 1 ? newActions : undefined,
    });
  }
  if (canView(user.roles, "sales")) {
    mobileTabs.push({ key: "quotes", label: "Quotes", href: "/sales", icon: TAB_ICONS.quotes });
    mobileTabs.push({ key: "orders", label: "Orders", href: "/sales/orders", icon: TAB_ICONS.orders });
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
      // While a user must still enroll MFA, hide the nav so they can't
      // soft-navigate off the security page (which would hit the layout
      // redirect and blank). They get full nav back the moment they enroll.
      navItems={mustEnroll ? [] : items}
      mobileTabs={mustEnroll ? [] : mobileTabs}
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
