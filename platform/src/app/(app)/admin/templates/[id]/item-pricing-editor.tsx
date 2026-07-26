"use client";

import { useState } from "react";
import type { PriceBreak } from "@/lib/sales/pricing";
import { setItemPricingAction } from "@/lib/sales/template-actions";

const input =
  "rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

export function ItemPricingEditor({
  templateId,
  itemId,
  itemName,
  initialBreaks,
  initialMinQty,
  initialSizeUpcharges,
  sizeOptions,
}: {
  templateId: string;
  itemId: string;
  itemName: string;
  initialBreaks: PriceBreak[] | null;
  initialMinQty: number;
  initialSizeUpcharges: Record<string, number> | null;
  sizeOptions: string[];
}) {
  const [minQty, setMinQty] = useState<number>(initialMinQty || 0);
  const [breaks, setBreaks] = useState<PriceBreak[]>(
    (initialBreaks ?? []).slice().sort((a, b) => a.minQty - b.minQty),
  );
  const [sizes, setSizes] = useState<Record<string, number>>(initialSizeUpcharges ?? {});

  const summary =
    (breaks.length ? `${breaks.length} price band${breaks.length > 1 ? "s" : ""}` : "flat price") +
    (minQty ? ` · min ${minQty}` : "") +
    (Object.keys(sizes).length ? ` · ${Object.keys(sizes).length} size upcharge${Object.keys(sizes).length > 1 ? "s" : ""}` : "");

  const setBreak = (i: number, patch: Partial<PriceBreak>) =>
    setBreaks((p) => p.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  return (
    <details className="mt-1 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
      <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-800">
        Quantity bands &amp; sizes <span className="text-neutral-400">· {summary}</span>
      </summary>

      <form action={setItemPricingAction} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={templateId} />
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="minQty" value={minQty} />
        <input type="hidden" name="priceBreaks" value={JSON.stringify(breaks)} />
        <input type="hidden" name="sizeUpcharges" value={JSON.stringify(sizes)} />

        {/* Minimum quantity */}
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          Minimum order qty
          <input
            type="number"
            min={0}
            value={minQty || ""}
            onChange={(e) => setMinQty(Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
            placeholder="0"
            className={`w-24 ${input}`}
          />
        </label>

        {/* Quantity price bands */}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Quantity price bands
          </p>
          <p className="mb-2 text-[11px] text-neutral-400">
            At each quantity and above, the item sells for the band price (e.g. 72 → $10.50, 144 → $9.25).
            Leave empty to use the flat sell price above.
          </p>
          <div className="space-y-1.5">
            {breaks.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-neutral-500">qty ≥</span>
                <input
                  type="number"
                  min={1}
                  value={b.minQty || ""}
                  onChange={(e) => setBreak(i, { minQty: Math.trunc(Number(e.target.value) || 0) })}
                  placeholder="72"
                  className={`w-24 ${input}`}
                />
                <span className="text-xs text-neutral-500">@ $</span>
                <input
                  type="number"
                  step="0.01"
                  value={b.unitPrice || ""}
                  onChange={(e) => setBreak(i, { unitPrice: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  className={`w-24 ${input}`}
                />
                <button
                  type="button"
                  onClick={() => setBreaks((p) => p.filter((_, idx) => idx !== i))}
                  className="text-neutral-400 hover:text-red-600"
                  aria-label="Remove band"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setBreaks((p) => [...p, { minQty: 0, unitPrice: 0 }])}
            className="mt-2 text-xs font-medium text-neutral-700 hover:text-neutral-900"
          >
            + Add band
          </button>
        </div>

        {/* Size upcharges */}
        {sizeOptions.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
              Size upcharges
            </p>
            <p className="mb-2 text-[11px] text-neutral-400">
              Added to the unit price for that size (e.g. 2XL +$2.00). Leave 0 for none.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {sizeOptions.map((s) => (
                <label key={s} className="flex items-center gap-1 text-xs text-neutral-600">
                  <span className="w-10 shrink-0">{s}</span>
                  <span className="text-neutral-400">+$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={sizes[s] || ""}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      setSizes((p) => {
                        const next = { ...p };
                        if (v) next[s] = v;
                        else delete next[s];
                        return next;
                      });
                    }}
                    placeholder="0"
                    className={`w-full ${input}`}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">
          Save pricing for {itemName}
        </button>
      </form>
    </details>
  );
}
