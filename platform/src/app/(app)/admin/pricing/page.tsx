import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { pricingMethods, pricingGarments } from "@/db/schema";
import { listExtras, listFreight, listRoyalties, searchGarments } from "@/lib/pricing/service";
import { upsertGarmentAction, updateExtraAction, updateFreightAction, updateRoyaltyAction } from "@/lib/pricing/actions";
import { PriceCalculator } from "./price-calculator";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 outline-none focus:border-brand";
const SUBTABS = [
  { k: "calculator", label: "Calculator" },
  { k: "garments", label: "Garments & costs" },
  { k: "extras", label: "Extras" },
  { k: "freight", label: "Vendor freight" },
  { k: "royalties", label: "Royalties" },
];

export default async function PricingAdminPage({ searchParams }: { searchParams: Promise<{ t?: string; q?: string }> }) {
  const sp = await searchParams;
  const tab = SUBTABS.find((s) => s.k === sp.t)?.k ?? "calculator";
  const q = sp.q ?? "";

  const methods = await db.select().from(pricingMethods).orderBy(asc(pricingMethods.label));
  const [extras, freight, royalties] = await Promise.all([listExtras(), listFreight(), listRoyalties()]);
  const garmentCount = (await db.select({ id: pricingGarments.id }).from(pricingGarments)).length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Softgoods Pricing</h2>
        <p className="text-sm text-neutral-500">
          The live pricing engine — replaces the &ldquo;Softgood Pricing Calculator&rdquo; spreadsheet.
          {" "}{garmentCount} garments, {royalties.length} royalties, {freight.length} freight rules. Silkscreen &amp; embroidery verified to the cent against the workbook.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-neutral-200">
        {SUBTABS.map((s) => (
          <Link key={s.k} href={`/admin/pricing?t=${s.k}`} className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium ${tab === s.k ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>{s.label}</Link>
        ))}
      </div>

      {tab === "calculator" && (
        <PriceCalculator
          methods={methods.map((m) => ({ key: m.key, label: m.label }))}
          extras={extras.map((e) => ({ id: e.id, label: e.label, amount: e.amount, kind: e.kind }))}
          royalties={royalties.map((r) => ({ name: r.name, pct: r.pct }))}
          freight={freight.map((f) => ({ vendor: f.vendor }))}
        />
      )}

      {tab === "garments" && <GarmentsSection q={q} />}

      {tab === "extras" && (
        <Section title="Extras (per-garment add-ons)" hint="Amounts feed the calculator's extras. Blank = quote / manual.">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-400"><tr><th className="py-1">Label</th><th>Kind</th><th>Amount</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {extras.map((e) => (
                <tr key={e.id}>
                  <td className="py-1 pr-2 text-neutral-800">{e.label}</td>
                  <td className="py-1 pr-2 text-neutral-500">{e.kind}</td>
                  <td className="py-1">
                    <form action={updateExtraAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={e.id} />
                      <input name="amount" defaultValue={e.amount ?? ""} placeholder="quote" className={`w-24 ${input}`} />
                      <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === "freight" && (
        <Section title="Vendor freight rules" hint="Auto-applied per garment. Free-over waives the charge when the order's garment cost hits the threshold.">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-400"><tr><th className="py-1">Vendor</th><th>Add/garment</th><th>Free over</th><th>Under</th><th></th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {freight.map((f) => (
                <tr key={f.id}>
                  <td className="py-1 pr-2 text-neutral-800">{f.vendor}</td>
                  <td colSpan={4}>
                    <form action={updateFreightAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={f.id} />
                      <input name="addPerGarment" defaultValue={f.addPerGarment ?? ""} placeholder="add" className={`w-20 ${input}`} />
                      <input name="freeOverCost" defaultValue={f.freeOverCost ?? ""} placeholder="free over" className={`w-24 ${input}`} />
                      <input name="underThreshold" defaultValue={f.underThreshold ?? ""} placeholder="under" className={`w-20 ${input}`} />
                      <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === "royalties" && (
        <Section title="Artist royalties" hint="Percentage added on top of the decorated price when the design carries a royalty.">
          <table className="w-full max-w-md text-sm">
            <tbody className="divide-y divide-neutral-100">
              {royalties.map((r) => (
                <tr key={r.id}>
                  <td className="py-1 pr-2 text-neutral-800">{r.name}</td>
                  <td className="py-1">
                    <form action={updateRoyaltyAction} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <input name="pct" defaultValue={r.pct} className={`w-20 ${input}`} />
                      <span className="text-xs text-neutral-400">(0.07 = 7%)</span>
                      <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Save</button>
                    </form>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} className="pt-2">
                  <form action={updateRoyaltyAction} className="flex items-center gap-1">
                    <input name="name" placeholder="New artist" className={`w-40 ${input}`} />
                    <input name="pct" placeholder="0.10" className={`w-20 ${input}`} />
                    <button className="rounded bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-700">Add</button>
                  </form>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      {hint && <p className="mb-3 text-xs text-neutral-500">{hint}</p>}
      {children}
    </div>
  );
}

async function GarmentsSection({ q }: { q: string }) {
  const rows = await searchGarments(q, 50);
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-neutral-900">Garment costs</h3>
        <form className="flex items-center gap-1">
          <input type="hidden" name="t" value="garments" />
          <input name="q" defaultValue={q} placeholder="Search #, description, supplier…" className={`w-64 ${input}`} />
          <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Search</button>
        </form>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-neutral-400"><tr><th className="py-1">#</th><th>Description</th><th>Supplier</th><th>Cost</th><th></th></tr></thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((g) => (
            <tr key={g.id}>
              <td className="py-1 pr-2 font-medium text-neutral-800">{g.garmentNumber}</td>
              <td className="py-1 pr-2 text-neutral-600">{g.description}</td>
              <td className="py-1 pr-2 text-neutral-500">{g.supplier}</td>
              <td colSpan={2}>
                <form action={upsertGarmentAction} className="flex items-center gap-1">
                  <input type="hidden" name="garmentNumber" value={g.garmentNumber} />
                  <input type="hidden" name="supplier" value={g.supplier ?? ""} />
                  <input type="hidden" name="description" value={g.description ?? ""} />
                  <input name="cost" defaultValue={g.cost} className={`w-24 ${input}`} />
                  <button className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={upsertGarmentAction} className="mt-3 flex flex-wrap items-center gap-1 border-t border-neutral-100 pt-3">
        <input name="garmentNumber" placeholder="New #" className={`w-24 ${input}`} />
        <input name="description" placeholder="Description" className={`w-48 ${input}`} />
        <input name="supplier" placeholder="Supplier" className={`w-32 ${input}`} />
        <input name="cost" placeholder="Cost" className={`w-20 ${input}`} />
        <button className="rounded bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-700">Add garment</button>
      </form>
    </div>
  );
}
