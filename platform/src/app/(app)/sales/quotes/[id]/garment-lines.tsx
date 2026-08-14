"use client";

import { useState } from "react";
import { priceGarmentLine, type DecorationInput, type GarmentLineData, type MethodRef, type EmbTierRef, type SizeEntry, type EngineConfigs } from "@/lib/sales/pricing";

// Standard blank-apparel colors, used when a garment has no specific colors on
// file (every imported softgoods garment). Per-garment colors set in Admin →
// Catalog override this. tierCode drives the dark-garment upcharge in the older
// markup model; the softgoods engine prices by cost + level and ignores it.
const DEFAULT_COLOR_PALETTE: { name: string; tierCode: string | null; hex: string | null }[] = [
  { name: "White", tierCode: "light", hex: "#ffffff" },
  { name: "Natural", tierCode: "light", hex: "#efe8d8" },
  { name: "Sand", tierCode: "light", hex: "#d9c9a3" },
  { name: "Ash", tierCode: "light", hex: "#d5d5d0" },
  { name: "Sport Grey", tierCode: "light", hex: "#b0b0b0" },
  { name: "Light Blue", tierCode: "light", hex: "#a9c7dd" },
  { name: "Yellow", tierCode: "light", hex: "#f4d03f" },
  { name: "Gold", tierCode: "light", hex: "#e8b923" },
  { name: "Pink", tierCode: "light", hex: "#f4a7c0" },
  { name: "Black", tierCode: "dark", hex: "#111111" },
  { name: "Charcoal", tierCode: "dark", hex: "#41474d" },
  { name: "Dark Heather", tierCode: "dark", hex: "#585c60" },
  { name: "Navy", tierCode: "dark", hex: "#1f2a44" },
  { name: "Royal", tierCode: "dark", hex: "#1e4fa3" },
  { name: "Red", tierCode: "dark", hex: "#b42025" },
  { name: "Cardinal", tierCode: "dark", hex: "#8a1f2b" },
  { name: "Maroon", tierCode: "dark", hex: "#5c1a2b" },
  { name: "Orange", tierCode: "dark", hex: "#e3610f" },
  { name: "Forest Green", tierCode: "dark", hex: "#1f3d2b" },
  { name: "Kelly Green", tierCode: "dark", hex: "#1f7a44" },
  { name: "Military Green", tierCode: "dark", hex: "#4b5320" },
  { name: "Purple", tierCode: "dark", hex: "#4b2e83" },
  { name: "Brown", tierCode: "dark", hex: "#4a3526" },
  { name: "Teal", tierCode: "dark", hex: "#1c6b6b" },
];

export interface StyleOption {
  id: string;
  name: string;
  brand: string | null;
  styleNumber: string | null;
  basePrice: number;
  sizeClassCode: string | null;
  colors: { name: string; tierCode: string | null; hex: string | null }[];
}
export interface CatalogRefs {
  styles: StyleOption[];
  sizeClassByCode: Record<string, SizeEntry[]>;
  methods: MethodRef[];
  locations: { code: string; name: string }[];
  embTiers: { code: string; name: string; pricePerUnit: number }[];
  engine?: EngineConfigs; // softgoods pricing engine config (silkscreen)
  garmentCostByStyleId?: Record<string, number>; // supplier cost per style
  extras?: { id: string; label: string; amount: number | null; kind: string }[]; // barcode, folding, hang tags…
}

const money = (n: number) => `$${n.toFixed(2)}`;
const inp = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";

/** Type-to-search garment picker over the in-memory catalog (handles 800+ blanks). */
function GarmentCombo({ styles, value, disabled, onPick }: { styles: StyleOption[]; value: string | null; disabled?: boolean; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = styles.find((s) => s.id === value);
  const label = (s: StyleOption) => `${[s.brand, s.styleNumber].filter(Boolean).join(" ")} ${s.name}`.trim();
  const ql = q.trim().toLowerCase();
  const matches = (ql ? styles.filter((s) => label(s).toLowerCase().includes(ql)) : styles).slice(0, 30);
  return (
    <div className="relative">
      <input
        disabled={disabled}
        value={open ? q : selected ? label(selected) : ""}
        placeholder="Search garment — name, brand, or style #…"
        onFocus={() => { setOpen(true); setQ(""); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`mt-1 w-full ${inp}`}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-neutral-200 bg-white text-sm shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-neutral-400">No matches</li>}
          {matches.map((s) => (
            <li key={s.id}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); onPick(s.id); setOpen(false); setQ(""); }} className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50">
                {label(s)}
              </button>
            </li>
          ))}
          {matches.length === 30 && <li className="px-3 py-1.5 text-[11px] text-neutral-400">Keep typing to narrow…</li>}
        </ul>
      )}
    </div>
  );
}

export function refMaps(refs: CatalogRefs) {
  const methods = new Map<string, MethodRef>(refs.methods.map((m) => [m.code, m]));
  const embTiers = new Map<string, EmbTierRef>(refs.embTiers.map((e) => [e.code, { code: e.code, pricePerUnit: e.pricePerUnit }]));
  return { methods, embTiers };
}

/** Summed per-garment extras cost for a line (barcode, folding…). */
export function extrasPerUnitOf(line: GarmentLineData, refs: CatalogRefs): number {
  const chosen = new Set(line.extras ?? []);
  return (refs.extras ?? []).filter((e) => chosen.has(e.id) && e.amount != null).reduce((s, e) => s + (e.amount ?? 0), 0);
}

/** Price one garment line with the client-side copy of the pricing engine. */
export function priceGarment(line: GarmentLineData, refs: CatalogRefs) {
  const style = refs.styles.find((s) => s.id === line.styleId);
  const sizes = style?.sizeClassCode ? refs.sizeClassByCode[style.sizeClassCode] ?? null : null;
  const { methods, embTiers } = refMaps(refs);
  return priceGarmentLine({
    basePrice: style?.basePrice ?? 0,
    sizeClassSizes: sizes,
    sizeBreakdown: line.sizeBreakdown ?? {},
    colorTier: line.colorTier ?? undefined,
    decorations: line.decorations ?? [],
    methods,
    embTiers,
    isReorder: false, // setups recomputed with reorder flag at save; preview uses new
    engine: refs.engine,
    garmentCost: style ? refs.garmentCostByStyleId?.[style.id] : undefined,
    extrasPerUnit: extrasPerUnitOf(line, refs),
  });
}

export function GarmentLineCard({
  line,
  refs,
  editable,
  isReorder,
  onChange,
  onRemove,
}: {
  line: GarmentLineData;
  refs: CatalogRefs;
  editable: boolean;
  isReorder: boolean;
  onChange: (patch: Partial<GarmentLineData>) => void;
  onRemove: () => void;
}) {
  const style = refs.styles.find((s) => s.id === line.styleId);
  const sizes = style?.sizeClassCode ? refs.sizeClassByCode[style.sizeClassCode] ?? [] : [];
  const { methods, embTiers } = refMaps(refs);
  const price = priceGarmentLine({
    basePrice: style?.basePrice ?? 0,
    sizeClassSizes: sizes,
    sizeBreakdown: line.sizeBreakdown ?? {},
    colorTier: line.colorTier ?? undefined,
    decorations: line.decorations ?? [],
    methods,
    embTiers,
    isReorder,
    engine: refs.engine,
    garmentCost: style ? refs.garmentCostByStyleId?.[style.id] : undefined,
    extrasPerUnit: extrasPerUnitOf(line, refs),
  });

  function toggleExtra(id: string, on: boolean) {
    const cur = new Set(line.extras ?? []);
    if (on) cur.add(id); else cur.delete(id);
    onChange({ extras: [...cur] });
  }

  function pickStyle(id: string) {
    const s = refs.styles.find((x) => x.id === id);
    onChange({ styleId: id || null, description: s?.name ?? "", color: null, colorTier: null, sizeBreakdown: {} });
  }
  const colorOptions = style?.colors && style.colors.length > 0 ? style.colors : DEFAULT_COLOR_PALETTE;
  function pickColor(name: string) {
    const c = colorOptions.find((x) => x.name === name);
    onChange({ color: name || null, colorTier: c?.tierCode ?? null });
  }
  function setSizeQty(size: string, qty: number) {
    const next = { ...(line.sizeBreakdown ?? {}) };
    if (qty > 0) next[size] = qty;
    else delete next[size];
    onChange({ sizeBreakdown: next });
  }
  function setDecos(decorations: DecorationInput[]) {
    onChange({ decorations });
  }
  function addDeco() {
    setDecos([...(line.decorations ?? []), { location: refs.locations[0]?.code ?? "", method: refs.methods[0]?.code ?? "", colorCount: 1 }]);
  }
  function patchDeco(i: number, patch: Partial<DecorationInput>) {
    setDecos((line.decorations ?? []).map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function removeDeco(i: number) {
    setDecos((line.decorations ?? []).filter((_, idx) => idx !== i));
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="sm:col-span-2 text-xs text-neutral-500">Garment
          <GarmentCombo styles={refs.styles} value={line.styleId ?? null} disabled={!editable} onPick={pickStyle} />
        </label>
        <label className="text-xs text-neutral-500">Color
          <select disabled={!editable || !style} value={line.color ?? ""} onChange={(e) => pickColor(e.target.value)} className={`mt-1 w-full ${inp}`}>
            <option value="">— color —</option>
            {colorOptions.map((c) => <option key={c.name} value={c.name}>{c.name}{c.tierCode ? ` (${c.tierCode})` : ""}</option>)}
          </select>
        </label>
      </div>

      {/* Size grid */}
      {sizes.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-neutral-500">Quantity by size{line.colorTier ? ` · ${line.colorTier} garment` : ""}</div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((s) => (
              <label key={s.size} className="w-16 text-center text-[11px] text-neutral-500">
                {s.size}{s.upcharge ? <span className="text-amber-600"> +{money(s.upcharge)}</span> : ""}
                <input disabled={!editable} type="number" min="0" inputMode="numeric" value={line.sizeBreakdown?.[s.size] || ""} onChange={(e) => setSizeQty(s.size, Number(e.target.value))} className={`mt-0.5 w-full text-center ${inp}`} />
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Decorations */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-neutral-500">Decorations</span>
          {editable && <button type="button" onClick={addDeco} className="text-xs font-medium text-neutral-700 hover:text-neutral-900">+ Add decoration</button>}
        </div>
        <div className="space-y-2">
          {(line.decorations ?? []).length === 0 && <p className="text-xs text-neutral-400">No decorations — blank garment.</p>}
          {(line.decorations ?? []).map((d, i) => {
            const method = methods.get(d.method);
            const isStitch = method?.priceMode === "stitch";
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select disabled={!editable} value={d.location} onChange={(e) => patchDeco(i, { location: e.target.value })} className={inp} title="Location">
                  {refs.locations.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
                <select disabled={!editable} value={d.method} onChange={(e) => patchDeco(i, { method: e.target.value })} className={inp} title="Method">
                  {refs.methods.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
                </select>
                {isStitch ? (
                  refs.engine?.embroidery ? (
                    <label className="flex items-center gap-1 text-xs text-neutral-500" title="Stitch count — drives engine embroidery pricing">stitches
                      <input disabled={!editable} type="number" min="0" step="500" value={d.stitchCount ?? ""} placeholder="e.g. 8000" onChange={(e) => patchDeco(i, { stitchCount: Number(e.target.value) })} className={`w-24 ${inp}`} />
                    </label>
                  ) : (
                    <select disabled={!editable} value={d.stitchTier ?? ""} onChange={(e) => patchDeco(i, { stitchTier: e.target.value })} className={inp} title="Stitch tier">
                      <option value="">— stitch tier —</option>
                      {refs.embTiers.map((t) => <option key={t.code} value={t.code}>{t.name} ({money(t.pricePerUnit)})</option>)}
                    </select>
                  )
                ) : (
                  <>
                    <label className="flex items-center gap-1 text-xs text-neutral-500"># colors
                      <input disabled={!editable} type="number" min="1" value={d.colorCount ?? 1} onChange={(e) => patchDeco(i, { colorCount: Number(e.target.value) })} className={`w-16 ${inp}`} />
                    </label>
                    {refs.engine?.silkscreen && (
                      <label className="flex items-center gap-1 text-xs text-neutral-500" title="Screen-color class (A/B/C) — drives engine pricing">level
                        <select disabled={!editable} value={d.level ?? "B"} onChange={(e) => patchDeco(i, { level: e.target.value as "A" | "B" | "C" })} className={inp}>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </label>
                    )}
                  </>
                )}
                {editable && <button type="button" onClick={() => removeDeco(i)} className="text-neutral-400 hover:text-red-600" title="Remove">×</button>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Extras (barcodes, folding, hang tags…) — priced per garment by the engine */}
      {(refs.extras?.length ?? 0) > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-neutral-500">Extras <span className="text-neutral-400">(per garment)</span></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {refs.extras!.map((e) => (
              <label key={e.id} className="flex items-center gap-1.5 text-xs text-neutral-700">
                <input type="checkbox" disabled={!editable || e.amount == null} checked={(line.extras ?? []).includes(e.id)} onChange={(ev) => toggleExtra(e.id, ev.target.checked)} className="h-3.5 w-3.5" />
                {e.label}{e.amount != null ? ` (${money(e.amount)})` : " (quote)"}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Line price */}
      <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-sm">
        <div className="text-xs text-neutral-500">
          {price.totalUnits} pc{price.totalUnits === 1 ? "" : "s"} · {price.enginePriced ? "decorated" : "blank"} {money(price.garmentSubtotal)}
          {price.runSubtotal > 0 && ` · decoration ${money(price.runSubtotal)}`}
          {extrasPerUnitOf(line, refs) > 0 && ` · extras ${money(extrasPerUnitOf(line, refs))}/pc`}
          {price.setups.length > 0 && ` · setup ${money(price.setups.reduce((s, x) => s + x.amount, 0))}`}
          {price.enginePriced
            ? <span className="ml-1 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-700">engine</span>
            : (refs.engine?.silkscreen && style && !refs.garmentCostByStyleId?.[style.id]) ? <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700" title="No garment cost on file — add a supplier cost to this style (Admin → Catalog) to price via the engine">no cost</span> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-neutral-900">{money(price.extended)}</span>
          {editable && <button type="button" onClick={onRemove} className="text-xs font-medium text-red-600 hover:text-red-800">Remove</button>}
        </div>
      </div>
    </div>
  );
}
