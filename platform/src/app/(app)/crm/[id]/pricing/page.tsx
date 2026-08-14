import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, customerPricing, catalogStyles } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { addContractRuleAction, toggleContractRuleAction, removeContractRuleAction } from "@/lib/sales/contract-pricing-actions";

export const dynamic = "force-dynamic";
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const ERR: Record<string, string> = {
  type: "Choose a pricing type.", value: "Enter a value greater than zero.",
  pct: "A percentage off must be 100 or less.", style: "No garment matches that style number.",
};

export default async function CustomerPricingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string }> }) {
  const user = await requireModule("crm");
  const { id } = await params;
  const { e } = await searchParams;
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, id) });
  if (!bp) notFound();
  const editable = canEdit(user.roles, "crm") || canEdit(user.roles, "sales");

  const rules = await db
    .select({ id: customerPricing.id, styleId: customerPricing.styleId, type: customerPricing.type, value: customerPricing.value, note: customerPricing.note, active: customerPricing.active, styleNumber: catalogStyles.styleNumber, styleName: catalogStyles.name })
    .from(customerPricing)
    .leftJoin(catalogStyles, eq(catalogStyles.id, customerPricing.styleId))
    .where(eq(customerPricing.bpId, id))
    .orderBy(desc(customerPricing.createdAt));

  const describe = (t: string, v: number) => (t === "pct_off" ? `${v % 1 === 0 ? v : v.toFixed(2)}% off list` : `$${v.toFixed(2)} / unit (fixed)`);

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/crm/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← {bp.companyName}</Link>
      <PageHeader title="Contract pricing" description="Negotiated pricing for this customer — applied automatically in the quote builder, with the savings shown to the customer." />
      {e && ERR[e] && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{ERR[e]}</p>}

      <Card className="p-0">
        <div className="border-b border-neutral-200 px-4 py-3"><h2 className="text-sm font-semibold text-neutral-900">Active agreements</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-400"><tr><th className="px-4 py-2">Applies to</th><th className="px-4 py-2">Pricing</th><th className="px-4 py-2">Note</th><th className="px-4 py-2">Status</th>{editable && <th className="px-4 py-2"></th>}</tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {rules.length === 0 && <tr><td colSpan={editable ? 5 : 4} className="px-4 py-6 text-center text-neutral-400">No contract pricing yet. Standard list pricing applies.</td></tr>}
            {rules.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                <td className="px-4 py-2 text-neutral-800">{r.styleId ? <span className="font-medium">{[r.styleNumber, r.styleName].filter(Boolean).join(" · ")}</span> : <span className="text-neutral-500">All garments</span>}</td>
                <td className="px-4 py-2 font-medium text-neutral-900">{describe(r.type, Number(r.value))}</td>
                <td className="px-4 py-2 text-neutral-500">{r.note ?? "—"}</td>
                <td className="px-4 py-2">{r.active ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">active</span> : <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">paused</span>}</td>
                {editable && (
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-3">
                      <form action={toggleContractRuleAction.bind(null, id, r.id, !r.active)}><button className="text-xs text-neutral-500 hover:text-neutral-900">{r.active ? "Pause" : "Resume"}</button></form>
                      <form action={removeContractRuleAction.bind(null, id, r.id)}><button className="text-xs text-red-600 hover:text-red-800">Remove</button></form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editable && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-neutral-900">Add an agreement</h2>
          <p className="mb-3 text-xs text-neutral-500">Leave the style blank for a blanket rate across every garment, or enter a style number for a specific item (e.g. a fixed price on one hoodie). A style-specific rule wins over a blanket rate.</p>
          <form action={addContractRuleAction.bind(null, id)} className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-neutral-500">Style # <span className="text-neutral-400">(blank = all)</span><input name="styleNumber" placeholder="e.g. 18500" className={`mt-1 w-28 block ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Type
              <select name="type" className={`mt-1 block w-40 ${inp}`}>
                <option value="pct_off">% off list</option>
                <option value="fixed_unit">Fixed $/unit</option>
              </select>
            </label>
            <label className="text-xs text-neutral-500">Value<input name="value" type="number" step="0.01" placeholder="10 or 18.95" className={`mt-1 w-28 block ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Note<input name="note" placeholder="optional — PO#, term" className={`mt-1 w-48 block ${inp}`} /></label>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Add</button>
          </form>
        </Card>
      )}

      <p className="text-xs text-neutral-400">Contract pricing is applied on top of the standard pricing engine. <span className="font-medium">% off list</span> discounts the whole line; <span className="font-medium">fixed $/unit</span> sets an all-in per-piece price (the &ldquo;whale&rdquo; exception). The quote shows the list price struck through with the savings.</p>
    </div>
  );
}
