"use client";

import { useMemo, useState, useTransition } from "react";
import { priceQuote, resolveUnitPrice, sizeUpcharge, type ChargeRule, type PriceBreak } from "@/lib/sales/pricing";
import { saveQuoteAction } from "@/lib/sales/actions";

interface Item {
  code: string | null;
  name: string;
  unitPrice: number;
  priceBreaks: PriceBreak[] | null;
  minQty: number;
  sizeUpcharges: Record<string, number> | null;
}
interface Line { itemCode?: string; description: string; size?: string; qty: number; unitPrice: number }

const money = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const hasBands = (it?: Item) => !!it && !!it.priceBreaks && it.priceBreaks.length > 0;
const hasSizeUpcharges = (it?: Item) => !!it && !!it.sizeUpcharges && Object.keys(it.sizeUpcharges).length > 0;
const isAutoPriced = (it?: Item) => hasBands(it) || hasSizeUpcharges(it);
const inputCls = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

export function QuoteBuilder({
  quoteId,
  editable,
  catalog,
  sizeOptions,
  rules,
  initialLines,
  initialApplied,
  initialReorder,
  initialDiscount,
  initialNotes,
}: {
  quoteId: string;
  editable: boolean;
  catalog: Item[];
  sizeOptions: string[];
  rules: ChargeRule[];
  initialLines: Line[];
  initialApplied: { key: string; inputQty: number }[];
  initialReorder: boolean;
  initialDiscount: number;
  initialNotes: string;
}) {
  const showSize = sizeOptions.length > 0 && catalog.some((c) => hasSizeUpcharges(c));
  const catalogItem = (l: Line): Item | undefined =>
    catalog.find((c) => (c.code ?? c.name) === (l.itemCode ?? l.description));
  const [lines, setLines] = useState<Line[]>(initialLines.length ? initialLines : [{ description: "", qty: 0, unitPrice: 0 }]);
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
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const priced = useMemo(
    () =>
      priceQuote({
        lines,
        rules,
        applied: Object.entries(applied).filter(([, v]) => v.on).map(([key, v]) => ({ key, inputQty: v.inputQty })),
        isReorder,
        discount,
      }),
    [lines, rules, applied, isReorder, discount],
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const merged = { ...l, ...patch };
        // Auto-price catalog items from their quantity band + size upcharge, unless
        // the unit price was set explicitly in this same patch (manual override on
        // free/custom items). Catalog band items are always server-authoritative.
        const item = catalogItem(merged);
        if (isAutoPriced(item) && !("unitPrice" in patch)) {
          merged.unitPrice = round2(
            resolveUnitPrice(item!.priceBreaks, merged.qty, item!.unitPrice) +
              sizeUpcharge(item!.sizeUpcharges, merged.size),
          );
        }
        return merged;
      }),
    );
    setSaved(false);
  }
  function pickItem(i: number, code: string) {
    const item = catalog.find((c) => (c.code ?? c.name) === code);
    if (!item) {
      updateLine(i, { itemCode: undefined });
      return;
    }
    const qty = lines[i]?.qty ?? 0;
    const unitPrice = isAutoPriced(item)
      ? round2(resolveUnitPrice(item.priceBreaks, qty, item.unitPrice))
      : item.unitPrice;
    updateLine(i, { itemCode: item.code ?? undefined, description: item.name, size: undefined, unitPrice });
  }

  function save() {
    setSaved(false);
    startTransition(async () => {
      await saveQuoteAction(quoteId, {
        lines,
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
        {/* Line items */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">Line items</h2>
            {editable && (
              <button onClick={() => { setLines((p) => [...p, { description: "", qty: 0, unitPrice: 0 }]); setSaved(false); }} className="text-sm font-medium text-neutral-700 hover:text-neutral-900">+ Add line</button>
            )}
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const item = catalogItem(l);
              const auto = isAutoPriced(item);
              const belowMin = !!item && item.minQty > 0 && (l.qty || 0) > 0 && (l.qty || 0) < item.minQty;
              const gridCls = showSize
                ? "hidden items-center gap-2 lg:grid lg:grid-cols-[1fr_74px_60px_84px_70px_24px]"
                : "hidden items-center gap-2 lg:grid lg:grid-cols-[1fr_70px_90px_90px_28px]";
              return (
                <div key={i}>
                  {/* Mobile stacked line */}
                  <div className="space-y-2 rounded-lg border border-neutral-200 p-3 lg:hidden">
                    {catalog.length > 0 ? (
                      <select disabled={!editable} value={l.itemCode ?? (catalog.find((c) => c.name === l.description) ? (catalog.find((c) => c.name === l.description)!.code ?? l.description) : "__custom")} onChange={(e) => pickItem(i, e.target.value)} className={`w-full ${inputCls}`}>
                        <option value="__custom">— custom / type below —</option>
                        {catalog.map((c) => (
                          <option key={c.code ?? c.name} value={c.code ?? c.name}>{c.name}{c.unitPrice && !hasBands(c) ? ` (${money(c.unitPrice)})` : hasBands(c) ? " (qty-priced)" : ""}</option>
                        ))}
                      </select>
                    ) : (
                      <input disabled={!editable} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Description" className={`w-full ${inputCls}`} />
                    )}
                    <div className={`grid gap-2 ${showSize && hasSizeUpcharges(item) ? "grid-cols-3" : "grid-cols-2"}`}>
                      {showSize && hasSizeUpcharges(item) && (
                        <select disabled={!editable} value={l.size ?? ""} onChange={(e) => updateLine(i, { size: e.target.value || undefined })} className={inputCls} title="Size">
                          <option value="">size</option>
                          {sizeOptions.map((s) => (
                            <option key={s} value={s}>{s}{item!.sizeUpcharges![s] ? ` (+${money(item!.sizeUpcharges![s])})` : ""}</option>
                          ))}
                        </select>
                      )}
                      <input disabled={!editable} type="number" inputMode="numeric" value={l.qty || ""} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} placeholder="Qty" className={inputCls} />
                      <input disabled={!editable || auto} readOnly={auto} type="number" inputMode="decimal" step="0.01" value={l.unitPrice || ""} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} placeholder="Unit $" className={`${inputCls}${auto ? " bg-neutral-100 text-neutral-500" : ""}`} />
                    </div>
                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-sm text-neutral-500">Line total <span className="font-semibold text-neutral-800">{money((l.qty || 0) * (l.unitPrice || 0))}</span></span>
                      {editable && <button onClick={() => { setLines((p) => p.filter((_, idx) => idx !== i)); setSaved(false); }} className="text-sm font-medium text-red-600">Remove</button>}
                    </div>
                  </div>

                  {/* Desktop grid line */}
                  <div className={gridCls}>
                    {catalog.length > 0 ? (
                      <select disabled={!editable} value={l.itemCode ?? (catalog.find((c) => c.name === l.description) ? (catalog.find((c) => c.name === l.description)!.code ?? l.description) : "__custom")} onChange={(e) => pickItem(i, e.target.value)} className={inputCls}>
                        <option value="__custom">— custom / type below —</option>
                        {catalog.map((c) => (
                          <option key={c.code ?? c.name} value={c.code ?? c.name}>{c.name}{c.unitPrice && !hasBands(c) ? ` (${money(c.unitPrice)})` : hasBands(c) ? " (qty-priced)" : ""}</option>
                        ))}
                      </select>
                    ) : (
                      <input disabled={!editable} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Description" className={inputCls} />
                    )}
                    {showSize && (
                      hasSizeUpcharges(item) ? (
                        <select disabled={!editable} value={l.size ?? ""} onChange={(e) => updateLine(i, { size: e.target.value || undefined })} className={inputCls} title="Size">
                          <option value="">size</option>
                          {sizeOptions.map((s) => (
                            <option key={s} value={s}>{s}{item!.sizeUpcharges![s] ? ` (+${money(item!.sizeUpcharges![s])})` : ""}</option>
                          ))}
                        </select>
                      ) : (
                        <span />
                      )
                    )}
                    <input disabled={!editable} type="number" value={l.qty || ""} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} placeholder="Qty" className={inputCls} />
                    <input disabled={!editable || auto} readOnly={auto} type="number" step="0.01" value={l.unitPrice || ""} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} placeholder="Unit $" className={`${inputCls}${auto ? " bg-neutral-100 text-neutral-500" : ""}`} title={auto ? "Auto-priced from quantity band / size" : "Unit price"} />
                    <span className="text-right text-sm text-neutral-700">{money((l.qty || 0) * (l.unitPrice || 0))}</span>
                    {editable && <button onClick={() => { setLines((p) => p.filter((_, idx) => idx !== i)); setSaved(false); }} className="text-neutral-400 hover:text-red-600">×</button>}
                  </div>
                  {(auto || belowMin) && (
                    <p className="mt-0.5 pl-1 text-[11px]">
                      {auto && <span className="text-neutral-400">auto-priced{hasBands(item) ? " by quantity band" : ""}{l.size ? ` · ${l.size}` : ""}</span>}
                      {belowMin && <span className="ml-2 font-medium text-amber-600">below {item!.minQty} minimum</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {catalog.length > 0 && <p className="mt-2 text-xs text-neutral-400">Pick a catalog item to auto-fill its price. Quantity-priced items (e.g. caps) recalculate from the order quantity and chosen size — the unit price is set automatically. Choose “custom” to type a free line.</p>}
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
            <Row label="Subtotal" value={money(priced.subtotal)} />
            <Row label="Charges" value={money(priced.chargesTotal)} />
            <div className="flex items-center justify-between">
              <span className="text-neutral-600">Discount</span>
              <input disabled={!editable} type="number" step="0.01" value={discount || ""} onChange={(e) => { setDiscount(Number(e.target.value)); setSaved(false); }} placeholder="0.00" className={`w-24 text-right ${inputCls}`} />
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900">
              <span>Total</span><span>{money(priced.total)}</span>
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
