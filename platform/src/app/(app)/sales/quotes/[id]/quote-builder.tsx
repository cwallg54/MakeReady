"use client";

import { useMemo, useState, useTransition } from "react";
import { priceQuote, type ChargeRule } from "@/lib/sales/pricing";
import { saveQuoteAction } from "@/lib/sales/actions";

interface Item { code: string | null; name: string; unitPrice: number }
interface Line { itemCode?: string; description: string; qty: number; unitPrice: number }

const money = (n: number) => `$${n.toFixed(2)}`;
const inputCls = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

export function QuoteBuilder({
  quoteId,
  editable,
  catalog,
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
  rules: ChargeRule[];
  initialLines: Line[];
  initialApplied: { key: string; inputQty: number }[];
  initialReorder: boolean;
  initialDiscount: number;
  initialNotes: string;
}) {
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
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    setSaved(false);
  }
  function pickItem(i: number, code: string) {
    const item = catalog.find((c) => (c.code ?? c.name) === code);
    if (item) updateLine(i, { itemCode: item.code ?? undefined, description: item.name, unitPrice: item.unitPrice });
    else updateLine(i, { itemCode: undefined });
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
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_90px_90px_28px] items-center gap-2">
                {catalog.length > 0 ? (
                  <select disabled={!editable} value={l.itemCode ?? (catalog.find((c) => c.name === l.description) ? (catalog.find((c) => c.name === l.description)!.code ?? l.description) : "__custom")} onChange={(e) => pickItem(i, e.target.value)} className={inputCls}>
                    <option value="__custom">— custom / type below —</option>
                    {catalog.map((c) => (
                      <option key={c.code ?? c.name} value={c.code ?? c.name}>{c.name}{c.unitPrice ? ` (${money(c.unitPrice)})` : ""}</option>
                    ))}
                  </select>
                ) : (
                  <input disabled={!editable} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Description" className={inputCls} />
                )}
                <input disabled={!editable} type="number" value={l.qty || ""} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} placeholder="Qty" className={inputCls} />
                <input disabled={!editable} type="number" step="0.01" value={l.unitPrice || ""} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) })} placeholder="Unit $" className={inputCls} />
                <span className="text-right text-sm text-neutral-700">{money((l.qty || 0) * (l.unitPrice || 0))}</span>
                {editable && <button onClick={() => { setLines((p) => p.filter((_, idx) => idx !== i)); setSaved(false); }} className="text-neutral-400 hover:text-red-600">×</button>}
              </div>
            ))}
          </div>
          {catalog.length > 0 && <p className="mt-2 text-xs text-neutral-400">Pick a catalog item to auto-fill its price, or choose “custom” and type your own. Unit price is editable.</p>}
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
