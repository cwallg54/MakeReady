"use client";

import { useMemo, useState, useTransition } from "react";
import { priceQuote, type ChargeRule, type GarmentLineData } from "@/lib/sales/pricing";
import { saveQuoteAction } from "@/lib/sales/actions";
import { GarmentLineCard, priceGarment, type CatalogRefs } from "./garment-lines";

const money = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const inputCls = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand";

export function QuoteBuilder({
  quoteId,
  editable,
  rules,
  catalogRefs,
  initialGarmentLines,
  initialApplied,
  initialReorder,
  initialDiscount,
  initialNotes,
  canDiscount = true,
}: {
  quoteId: string;
  editable: boolean;
  rules: ChargeRule[];
  catalogRefs?: CatalogRefs;
  initialGarmentLines?: GarmentLineData[];
  initialApplied: { key: string; inputQty: number }[];
  initialReorder: boolean;
  initialDiscount: number;
  initialNotes: string;
  canDiscount?: boolean;
}) {
  const [applied, setApplied] = useState<Record<string, { on: boolean; inputQty: number }>>(() => {
    const m: Record<string, { on: boolean; inputQty: number }> = {};
    for (const r of rules) {
      const found = initialApplied.find((a) => a.key === r.key);
      m[r.key] = { on: !!found, inputQty: found?.inputQty ?? 1 };
    }
    return m;
  });
  const [isReorder, setIsReorder] = useState(initialReorder);
  const [discount, setDiscount] = useState(initialDiscount);
  const [notes, setNotes] = useState(initialNotes);
  const [garmentLines, setGarmentLines] = useState<GarmentLineData[]>(initialGarmentLines ?? []);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const hasCatalog = !!catalogRefs && catalogRefs.styles.length > 0;

  // Charges/discount math (garment lines carry their own pricing). priceQuote
  // runs with no simple lines and discount 0; totals are combined below.
  const priced = useMemo(
    () =>
      priceQuote({
        lines: [],
        rules,
        applied: Object.entries(applied).filter(([, v]) => v.on).map(([key, v]) => ({ key, inputQty: v.inputQty })),
        isReorder,
        discount: 0,
      }),
    [rules, applied, isReorder],
  );

  const garmentPrice = useMemo(() => {
    if (!catalogRefs) return { subtotal: 0, setups: 0 };
    let subtotal = 0;
    let setups = 0;
    for (const g of garmentLines) {
      const p = priceGarment(g, catalogRefs);
      subtotal += p.extended;
      setups += p.setups.reduce((s, x) => s + x.amount, 0);
    }
    return { subtotal: round2(subtotal), setups: round2(setups) };
  }, [garmentLines, catalogRefs]);

  const subtotal = round2(garmentPrice.subtotal);
  const chargesTotal = round2(priced.chargesTotal + garmentPrice.setups);
  const total = round2(subtotal + chargesTotal - (discount || 0));

  function updateGarment(i: number, patch: Partial<GarmentLineData>) {
    setGarmentLines((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
    setSaved(false);
  }
  function addGarment() {
    setGarmentLines((prev) => [...prev, { styleId: null, description: "", color: null, colorTier: null, sizeBreakdown: {}, decorations: [], extras: [] }]);
    setSaved(false);
  }
  function removeGarment(i: number) {
    setGarmentLines((prev) => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveQuoteAction(quoteId, {
        lines: [],
        garmentLines,
        applied: Object.entries(applied).filter(([, v]) => v.on).map(([key, v]) => ({ key, inputQty: v.inputQty })),
        isReorder,
        discount,
        notes,
      });
      setSaved(true);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Garments & decoration — the single line-item builder, priced by the engine */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Garments &amp; decoration</h2>
              <p className="text-xs text-neutral-500">Add each garment — pick the blank, sizes, decoration and extras. Priced automatically by the softgoods engine.</p>
            </div>
            {editable && hasCatalog && <button onClick={addGarment} className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">+ Add garment</button>}
          </div>
          {!hasCatalog ? (
            <p className="text-sm text-neutral-500">No garment catalog is set up yet. An admin adds blanks in Administration → Catalog &amp; Pricing.</p>
          ) : (
            <div className="space-y-3">
              {garmentLines.length === 0 && <p className="text-sm text-neutral-400">No garments yet. Click “Add garment” to build a screen-print or embroidery line.</p>}
              {garmentLines.map((g, i) => (
                <GarmentLineCard
                  key={i}
                  line={g}
                  refs={catalogRefs!}
                  editable={editable}
                  isReorder={isReorder}
                  onChange={(patch) => updateGarment(i, patch)}
                  onRemove={() => removeGarment(i)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Charges */}
        {rules.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Charges &amp; setup</h2>
            <div className="space-y-2">
              {rules.map((r) => {
                const st = applied[r.key] ?? { on: false, inputQty: 1 };
                const needsQty = r.type === "per_color" || r.type === "per_hour";
                return (
                  <div key={r.key} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" disabled={!editable} checked={st.on} onChange={(e) => { setApplied((p) => ({ ...p, [r.key]: { ...st, on: e.target.checked } })); setSaved(false); }} className="h-4 w-4" />
                    <span className="flex-1 text-neutral-700">{r.label} <span className="text-neutral-400">({r.type === "percent" ? `${r.rate}%` : money(r.rate)}{r.unit ? ` / ${r.unit}` : ""}{r.appliesWhen && r.appliesWhen !== "always" ? `, ${r.appliesWhen} only` : ""})</span></span>
                    {needsQty && st.on && (
                      <input type="number" disabled={!editable} value={st.inputQty} onChange={(e) => { setApplied((p) => ({ ...p, [r.key]: { ...st, inputQty: Number(e.target.value) } })); setSaved(false); }} className={`w-16 ${inputCls}`} title={r.unit ?? "qty"} />
                    )}
                    <span className="w-20 text-right text-neutral-600">{money(priced.charges.find((c) => c.key === r.key)?.amount ?? 0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <label className="mb-1 block text-sm font-semibold text-neutral-900">Notes</label>
          <textarea disabled={!editable} value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} rows={3} className={`w-full ${inputCls}`} />
        </div>
      </div>

      {/* Totals sidebar */}
      <div className="space-y-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" disabled={!editable} checked={isReorder} onChange={(e) => { setIsReorder(e.target.checked); setSaved(false); }} className="h-4 w-4" />
            Reorder (affects new-only setup charges)
          </label>
          <div className="mt-4 space-y-1.5 text-sm">
            <Row label="Subtotal" value={money(subtotal)} />
            <Row label="Charges" value={money(chargesTotal)} />
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Discount{!canDiscount && <span className="ml-1 text-[11px] text-neutral-400">(manager only)</span>}</span>
              <input disabled={!editable || !canDiscount} type="number" step="0.01" value={discount || ""} onChange={(e) => { setDiscount(Number(e.target.value)); setSaved(false); }} placeholder="0.00" title={canDiscount ? "Discount" : "Only a Sales Manager or Admin can discount"} className={`w-24 text-right ${inputCls}${!canDiscount ? " bg-neutral-100 text-neutral-400" : ""}`} />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900">
              <span>Total</span><span>{money(total)}</span>
            </div>
          </div>
          {editable && (
            <button onClick={save} disabled={pending} className="mt-4 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">
              {pending ? "Saving…" : saved ? "Saved ✓" : "Save quote"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-600">{label}</span>
      <span className="text-neutral-800">{value}</span>
    </div>
  );
}
