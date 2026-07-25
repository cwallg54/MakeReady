import type { Role } from "@/db/schema";

/**
 * RBAC — roles, module permission matrix, and Sales-Rep field restrictions.
 * Mirrors docs/requirements/rbac.md. This is the single source of truth for
 * access decisions; enforce it server-side on every request (never trust the
 * client). See src/lib/auth/guards.ts for the enforcement helpers.
 */

export const ROLES: Role[] = [
  "admin",
  "sales_manager",
  "sales_rep",
  "finance",
  "production",
  "art",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  sales_manager: "Sales Manager",
  sales_rep: "Sales Rep",
  finance: "Finance / Accounting",
  production: "Production",
  art: "Art Department",
};

// Access levels, ordered. Higher index = more capability.
export type Access = "none" | "view" | "edit" | "full";
export const ACCESS_ORDER: Access[] = ["none", "view", "edit", "full"];

export function accessAtLeast(have: Access, need: Access): boolean {
  return ACCESS_ORDER.indexOf(have) >= ACCESS_ORDER.indexOf(need);
}

// Module keys used for routing and nav.
export type ModuleKey =
  | "dashboard"
  | "crm"
  | "sales"
  | "web_store"
  | "accounting"
  | "controlling"
  | "asset_accounting"
  | "inventory"
  | "pos"
  | "jobs"
  | "quality"
  | "maintenance"
  | "content_library"
  | "workflows"
  | "reports"
  | "administration";

export const MODULES: {
  key: ModuleKey;
  label: string;
  href: string;
  // Phase 1 ships Dashboard + Administration as real screens; the rest are
  // nav-visible placeholders that later phases fill in.
  phase1: boolean;
}[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", phase1: true },
  { key: "crm", label: "CRM", href: "/crm", phase1: true },
  { key: "sales", label: "Sales", href: "/sales", phase1: true },
  { key: "web_store", label: "Web Store", href: "/web-store", phase1: false },
  { key: "accounting", label: "Accounting", href: "/accounting", phase1: false },
  { key: "controlling", label: "Controlling", href: "/controlling", phase1: false },
  { key: "asset_accounting", label: "Asset Accounting", href: "/asset-accounting", phase1: false },
  { key: "inventory", label: "Inventory & MRP", href: "/inventory", phase1: false },
  { key: "pos", label: "Point of Sale", href: "/pos", phase1: false },
  { key: "jobs", label: "Jobs & Production", href: "/jobs", phase1: false },
  { key: "quality", label: "Quality Management", href: "/quality", phase1: false },
  { key: "maintenance", label: "Equipment Maintenance", href: "/maintenance", phase1: false },
  { key: "content_library", label: "Content Library", href: "/content-library", phase1: false },
  { key: "workflows", label: "Workflows & Approvals", href: "/workflows", phase1: false },
  { key: "reports", label: "Reports", href: "/reports", phase1: false },
  { key: "administration", label: "Administration", href: "/admin", phase1: true },
];

/**
 * Per-role, per-module access. Derived directly from the permission matrix in
 * docs/requirements/rbac.md. "own"-scoped access is represented as "edit"/"view"
 * here; record-level ownership scoping is applied at query time in later phases.
 */
const MATRIX: Record<ModuleKey, Record<Role, Access>> = {
  dashboard: { admin: "full", sales_manager: "view", sales_rep: "view", finance: "view", production: "view", art: "view" },
  crm: { admin: "full", sales_manager: "full", sales_rep: "edit", finance: "view", production: "none", art: "none" },
  sales: { admin: "full", sales_manager: "full", sales_rep: "edit", finance: "view", production: "view", art: "none" },
  web_store: { admin: "full", sales_manager: "full", sales_rep: "view", finance: "view", production: "none", art: "none" },
  accounting: { admin: "full", sales_manager: "none", sales_rep: "none", finance: "full", production: "none", art: "none" },
  controlling: { admin: "full", sales_manager: "none", sales_rep: "none", finance: "full", production: "none", art: "none" },
  asset_accounting: { admin: "full", sales_manager: "none", sales_rep: "none", finance: "full", production: "none", art: "none" },
  inventory: { admin: "full", sales_manager: "view", sales_rep: "none", finance: "view", production: "full", art: "none" },
  pos: { admin: "full", sales_manager: "view", sales_rep: "none", finance: "none", production: "view", art: "none" },
  jobs: { admin: "full", sales_manager: "view", sales_rep: "none", finance: "none", production: "full", art: "view" },
  quality: { admin: "full", sales_manager: "none", sales_rep: "none", finance: "none", production: "full", art: "none" },
  maintenance: { admin: "full", sales_manager: "none", sales_rep: "none", finance: "none", production: "full", art: "none" },
  content_library: { admin: "full", sales_manager: "view", sales_rep: "edit", finance: "none", production: "view", art: "full" },
  workflows: { admin: "full", sales_manager: "view", sales_rep: "none", finance: "view", production: "none", art: "none" },
  reports: { admin: "full", sales_manager: "view", sales_rep: "view", finance: "view", production: "view", art: "view" },
  administration: { admin: "full", sales_manager: "none", sales_rep: "none", finance: "none", production: "none", art: "none" },
};

/** Highest access a set of roles grants for a module (roles are additive). */
export function moduleAccess(roles: Role[], module: ModuleKey): Access {
  let best: Access = "none";
  for (const role of roles) {
    const a = MATRIX[module][role];
    if (ACCESS_ORDER.indexOf(a) > ACCESS_ORDER.indexOf(best)) best = a;
  }
  return best;
}

export function canView(roles: Role[], module: ModuleKey): boolean {
  return accessAtLeast(moduleAccess(roles, module), "view");
}

export function canEdit(roles: Role[], module: ModuleKey): boolean {
  return accessAtLeast(moduleAccess(roles, module), "edit");
}

export function isAdmin(roles: Role[]): boolean {
  return roles.includes("admin");
}

/**
 * Whether the user may see finance-sensitive BP fields (credit limit, account
 * balance, finance notes). Hidden from Sales-Rep-only users per rbac.md.
 */
export function canSeeBpFinance(roles: Role[]): boolean {
  return roles.some((r) => r === "admin" || r === "sales_manager" || r === "finance");
}

/**
 * Whether CRM access is scoped to records the user owns (Sales Rep "own
 * accounts only"). Admins, Sales Managers, and Finance see all accounts.
 */
export function crmScopedToOwn(roles: Role[]): boolean {
  if (roles.includes("admin") || roles.includes("sales_manager") || roles.includes("finance")) {
    return false;
  }
  return roles.includes("sales_rep");
}

/** Modules a user should see in the nav (any view+ access). */
export function visibleModules(roles: Role[]) {
  return MODULES.filter((m) => canView(roles, m.key));
}

/** Map a pathname to the module it belongs to, for route-level enforcement. */
export function moduleForPath(pathname: string): ModuleKey | null {
  // Longest-prefix match against module hrefs.
  const match = [...MODULES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((m) => pathname === m.href || pathname.startsWith(m.href + "/"));
  return match?.key ?? null;
}

/**
 * Fields hidden or gated for the Sales-Rep role (docs/requirements/rbac.md).
 * Consumed by CRM/Sales screens in later phases; defined here so the rule lives
 * in one place.
 */
export const SALES_REP_RESTRICTIONS = {
  crm: { hidden: ["creditLimit", "accountBalance", "financeNotes"] },
  sales: { hidden: ["cost", "margin"], approvalRequired: { discountOverPct: 10 }, ownRecordsOnly: true },
  reports: { ownCustomersOnly: true },
} as const;
