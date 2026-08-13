"use client";

import { useActionState } from "react";
import { calcPriceAction, type PriceState } from "@/lib/pricing/actions";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const money = (n: number) => `$${n.toFixed(2)}`;

interface Props {
  methods: { key: string; label: string }[];
  extras: { id: string; label: string; amount: string | null; kind: string }[];
  royalties: { name: string; pct: string }[];
  freight: { vendor: string }[];
}

export function PriceCalculator({ methods, extras, royalties, freight }: Props) {
  const [state, action, pending] = useActionState<PriceState, FormData>(calcPriceAction, {});
  const r = state.result;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={action} className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-neutral-600">Method
            <select name="methodKey" className={`mt-1 w-full ${input}`} defaultValue="silkscreen">
              {methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-600">Quantity
            <input name="qty" type="number" min={1} defaultValue={144} className={`mt-1 w-full ${input}`} />
          </label>
          <label className="text-xs font-medium text-neutral-600">Garment #
            <input name="garmentNumber" placeholder="e.g. 9001" className={`mt-1 w-full ${input}`} />
          </label>
          <label className="text-xs font-medium text-neutral-600">…or cost override
            <input name="garmentCost" placeholder="$" className={`mt-1 w-full ${input}`} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-neutral-600">Print level (silkscreen)
            <select name="level" className={`mt-1 w-full ${input}`} defaultValue="B">
              <option value="A">A (fewest screens)</option>
              <option value="B">B</option>
              <option value="C">C (most screens)</option>
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-600">Customer tier
            <select name="tier" className={`mt-1 w-full ${input}`} defaultValue="list">
              <option value="list">List</option>
              <option value="HV">HV (−3%)</option>
              <option value="MV">MV (−5%)</option>
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-600">Stitch count 1 (embroidery)
            <input name="stitch1" type="number" min={0} placeholder="0" className={`mt-1 w-full ${input}`} />
          </label>
          <label className="text-xs font-medium text-neutral-600">Stitch count 2
            <input name="stitch2" type="number" min={0} placeholder="0" className={`mt-1 w-full ${input}`} />
          </label>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-700">
          <label className="flex items-center gap-1.5"><input type="checkbox" name="leftChestYoke" className="h-4 w-4" /> Left chest / yoke</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="sleeve" className="h-4 w-4" /> Sleeve</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="allOverStain" className="h-4 w-4" /> All-over stain</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" name="newDigitizing" className="h-4 w-4" /> New digitizing</label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-neutral-600">Royalty
            <select name="royaltyName" className={`mt-1 w-full ${input}`} defaultValue="None">
              <option value="None">None</option>
              {royalties.map((x) => <option key={x.name} value={x.name}>{x.name} ({(Number(x.pct) * 100).toFixed(0)}%)</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-600">Vendor freight
            <select name="freightVendor" className={`mt-1 w-full ${input}`} defaultValue="">
              <option value="">None</option>
              {freight.map((f) => <option key={f.vendor} value={f.vendor}>{f.vendor}</option>)}
            </select>
          </label>
        </div>

        <fieldset className="rounded-md border border-neutral-200 p-2">
          <legend className="px-1 text-xs font-semibold text-neutral-500">Extras</legend>
          <div className="grid max-h-36 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto text-xs text-neutral-700">
            {extras.map((e) => (
              <label key={e.id} className="flex items-center gap-1.5">
                <input type="checkbox" name="extraIds" value={e.id} className="h-3.5 w-3.5" disabled={e.amount == null} />
                {e.label}{e.amount != null ? ` (${money(Number(e.amount))})` : " (quote)"}
              </label>
            ))}
          </div>
        </fieldset>

        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">{pending ? "Pricing…" : "Calculate price"}</button>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-neutral-900">Price</h3>
        {!r ? (
          <p className="mt-2 text-sm text-neutral-400">Enter a line and click Calculate.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs text-neutral-500">{r.method} · {r.garmentNumber ?? "custom"}{r.description ? ` · ${r.description}` : ""} · garment cost {money(r.garmentCost)} · qty break {r.qtyBreak}</p>
              <p className="mt-1 text-3xl font-bold text-neutral-900">{money(r.unit)}<span className="ml-1 text-sm font-normal text-neutral-500">/ pc (S–XL)</span></p>
              {r.royaltyUnit != null && <p className="text-sm text-amber-700">With royalty ({(r.royaltyPct * 100).toFixed(0)}%): <span className="font-semibold">{money(r.royaltyUnit)}</span></p>}
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-neutral-100">
                {Object.entries(r.bySize).map(([size, price]) => (
                  <tr key={size}><td className="py-1 text-neutral-600">{size}</td><td className="py-1 text-right font-medium">{money(price)}</td></tr>
                ))}
                {r.oneTime > 0 && <tr><td className="py-1 text-neutral-600">One-time (digitizing)</td><td className="py-1 text-right font-medium">{money(r.oneTime)}</td></tr>}
              </tbody>
            </table>
            <details className="text-xs text-neutral-500">
              <summary className="cursor-pointer font-semibold">Breakdown</summary>
              <ul className="mt-1 space-y-0.5">
                {Object.entries(r.breakdown).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span>{typeof v === "number" ? (k === "multiplier" ? v : money(v)) : v}</span></li>)}
                {r.extrasApplied.map((e) => <li key={e.label} className="flex justify-between"><span>+ {e.label}</span><span>{money(e.amount)}</span></li>)}
                {r.freightApplied > 0 && <li className="flex justify-between"><span>+ freight</span><span>{money(r.freightApplied)}</span></li>}
              </ul>
            </details>
            {r.warnings.length > 0 && <ul className="text-xs text-amber-600">{r.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}
