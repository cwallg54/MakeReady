import Link from "next/link";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { storePromos } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { addPromoAction, togglePromoAction, deletePromoAction } from "@/lib/store/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

export default async function StorePromosPage() {
  const user = await requireModule("web_store");
  if (!canEdit(user.roles, "web_store")) redirect("/web-store");
  const rows = await db.select().from(storePromos).orderBy(desc(storePromos.createdAt));

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader title="Promo codes" description="Discount codes customers enter at checkout — percent or fixed amount." />

      <Card>
        <form action={addPromoAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="col-span-2 sm:col-span-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Code</span><input name="code" required placeholder="SAVE10" className={`w-full uppercase ${inp}`} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">Type</span><select name="kind" className={`w-full ${inp}`}><option value="percent">Percent %</option><option value="fixed">Fixed $</option></select></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">Value</span><input name="value" type="number" step="0.01" min="0" required placeholder="10" className={`w-full ${inp}`} /></label>
          <label><span className="mb-1 block text-xs font-medium text-neutral-600">Min spend $</span><input name="minSubtotal" type="number" step="0.01" min="0" placeholder="0" className={`w-full ${inp}`} /></label>
          <label className="col-span-2 sm:col-span-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Usage limit</span><input name="usageLimit" type="number" min="0" placeholder="unlimited" className={`w-full ${inp}`} /></label>
          <label className="col-span-2 sm:col-span-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Expires</span><input name="expiresAt" type="date" className={`w-full ${inp}`} /></label>
          <label className="col-span-2"><span className="mb-1 block text-xs font-medium text-neutral-600">Description</span><input name="description" placeholder="optional" className={`w-full ${inp}`} /></label>
          <div className="col-span-2 sm:col-span-4"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add code</button></div>
        </form>
      </Card>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">Code</th><th className="px-4 py-2">Discount</th><th className="px-4 py-2">Min</th><th className="px-4 py-2">Used</th><th className="px-4 py-2">Expires</th><th className="px-4 py-2"></th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No promo codes yet.</td></tr>}
            {rows.map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                <td className="px-4 py-2 font-mono font-semibold text-neutral-900">{p.code}{p.description ? <span className="block text-[10px] font-normal text-neutral-400">{p.description}</span> : null}</td>
                <td className="px-4 py-2 text-neutral-700">{p.kind === "percent" ? `${Number(p.value)}%` : `$${Number(p.value).toFixed(2)}`}</td>
                <td className="px-4 py-2 text-neutral-500">{Number(p.minSubtotal) > 0 ? `$${Number(p.minSubtotal).toFixed(0)}` : "—"}</td>
                <td className="px-4 py-2 text-neutral-500">{p.usedCount}{p.usageLimit != null ? ` / ${p.usageLimit}` : ""}</td>
                <td className="px-4 py-2 text-neutral-500">{p.expiresAt ? fmtDate(p.expiresAt) : "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <form action={togglePromoAction}><input type="hidden" name="id" value={p.id} /><button className="text-xs font-medium text-neutral-600 hover:text-neutral-900">{p.active ? "Disable" : "Enable"}</button></form>
                    <form action={deletePromoAction}><input type="hidden" name="id" value={p.id} /><ConfirmButton message={`Delete ${p.code}?`} className="text-xs text-red-600 hover:text-red-800">Delete</ConfirmButton></form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
