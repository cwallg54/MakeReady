// Maps the current app route to the most relevant help article slug.
// Longest matching prefix wins, so specific routes beat general ones.

const ROUTE_HELP: Record<string, string> = {
  "/dashboard": "dashboard",
  "/notifications": "notifications",
  "/account/security": "two-factor-authentication",
  "/account/scheduling": "setting-your-availability",
  "/crm/new": "creating-a-business-partner",
  "/crm/pipeline": "pipeline",
  "/crm": "business-partners", // /crm and /crm/[id] fall here
  "/sales/quotes/new": "building-a-quote",
  "/sales/quotes": "editing-and-emailing-a-quote",
  "/sales/orders": "orders-and-production-stages",
  "/sales/automations": "sales-automations",
  "/sales": "building-a-quote",
  "/production": "production-jobs",
  "/designs/new": "creating-a-design",
  "/designs/reconcile": "design-reconciliation",
  "/designs": "design-library",
  "/inventory/forecast": "reorder-forecast",
  "/inventory/bins": "bin-management",
  "/inventory": "inventory-overview",
  "/accounting/credit-requests": "credit-approvals",
  "/accounting": "invoicing-and-payments",
  "/reports/standard/credit": "credit-control",
  "/reports/standard/revenue-trend": "analytics-reports",
  "/reports/standard/top-products": "analytics-reports",
  "/reports/standard/rep-activity": "analytics-reports",
  "/reports/standard/lead-source-roi": "analytics-reports",
  "/reports/standard": "standard-reports",
  "/reports/config": "building-and-scheduling-reports",
  "/reports/new": "building-and-scheduling-reports",
  "/reports": "reports-overview",
  "/calendar": "team-calendar",
  "/admin/users": "users-and-roles",
  "/admin/account-groups": "account-groups",
  "/admin/templates": "order-templates",
  "/admin/catalog": "catalog-and-pricing",
  "/admin/config": "system-configuration",
  "/admin/audit": "audit-log",
  "/admin": "users-and-roles",
};

/** Best-matching article slug for a pathname, or null (→ Help Center home). */
export function helpSlugForPath(pathname: string): string | null {
  // A record detail page like /crm/<id> should map to the account article.
  if (/^\/crm\/[^/]+$/.test(pathname)) return "managing-an-account";
  if (/^\/crm\/[^/]+\/document\//.test(pathname)) return "financial-intake-documents";
  if (/^\/sales\/orders\/[^/]+/.test(pathname)) return "orders-and-production-stages";
  if (/^\/calendar\/[^/]+\/reschedule/.test(pathname)) return "managing-a-meeting";
  if (/^\/calendar\/[^/]+/.test(pathname)) return "managing-a-meeting";

  let best: string | null = null;
  let bestLen = -1;
  for (const [prefix, slug] of Object.entries(ROUTE_HELP)) {
    if ((pathname === prefix || pathname.startsWith(prefix + "/")) && prefix.length > bestLen) {
      best = slug;
      bestLen = prefix.length;
    }
  }
  return best;
}
