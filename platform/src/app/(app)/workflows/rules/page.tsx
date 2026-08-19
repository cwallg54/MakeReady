import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { isAdmin, ROLES, ROLE_LABELS } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { listRules } from "@/lib/workflows/approvals";
import { createRuleAction, toggleRuleAction, deleteRuleAction } from "@/lib/workflows/actions";

export const dynamic = "force-dynamic";
const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";

export default async function RulesPage() {
  const user = await requireModule("workflows");
  if (!isAdmin(user.roles)) redirect("/403");
  const rules = await listRules();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Approval rules" description="Thresholds that require a sign-off. When an event crosses a rule, an approval request is raised to the chosen role." />
        <Link href="/workflows" className="text-sm text-neutral-500 hover:underline">← Workflows</Link>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="py-1">Rule</th><th className="py-1">When</th><th className="py-1">Approver</th><th className="py-1">Status</th><th className="py-1"></th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rules.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-400">No rules yet. Add one below (e.g. order ≥ $5,000 → Sales Manager).</td></tr>}
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="py-1.5 font-medium text-neutral-900">{r.name}</td>
                <td className="py-1.5 text-neutral-600">{r.entityType} {r.metric === "discount_pct" ? "discount" : "amount"} {r.operator === "gt" ? ">" : "≥"} {r.metric === "discount_pct" ? `${Number(r.threshold)}%` : `$${Number(r.threshold).toLocaleString()}`}</td>
                <td className="py-1.5 text-neutral-600">{ROLE_LABELS[r.approverRole]}</td>
                <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-200 text-neutral-600"}`}>{r.active ? "active" : "off"}</span></td>
                <td className="py-1.5 text-right">
                  <form action={toggleRuleAction} className="inline"><input type="hidden" name="id" value={r.id} /><button className="mr-3 text-xs text-neutral-500 hover:underline">{r.active ? "Disable" : "Enable"}</button></form>
                  <form action={deleteRuleAction} className="inline"><input type="hidden" name="id" value={r.id} /><button className="text-xs text-neutral-400 hover:text-red-600">Delete</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">New rule</h2>
        <form action={createRuleAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Name</label><input name="name" placeholder="Large order approval" className={`${input} w-full`} /></div>
          <div><label className={label}>Applies to</label><select name="entityType" defaultValue="order" className={`${input} w-full`}><option value="order">Order</option><option value="quote">Quote</option><option value="discount">Discount</option><option value="bill">Bill</option></select></div>
          <div><label className={label}>Metric</label><select name="metric" defaultValue="amount" className={`${input} w-full`}><option value="amount">Amount ($)</option><option value="discount_pct">Discount (%)</option></select></div>
          <div><label className={label}>Operator</label><select name="operator" defaultValue="gte" className={`${input} w-full`}><option value="gte">≥ at least</option><option value="gt">&gt; over</option></select></div>
          <div><label className={label}>Threshold</label><input name="threshold" inputMode="decimal" placeholder="5000" className={`${input} w-full`} /></div>
          <div><label className={label}>Approver role</label><select name="approverRole" defaultValue="sales_manager" className={`${input} w-full`}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
          <div className="flex items-end justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add rule</button></div>
        </form>
      </Card>
    </div>
  );
}
