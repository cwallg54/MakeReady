"use client";

import { priceGarmentLine, type DecorationInput, type GarmentLineData, type MethodRef, type EmbTierRef, type SizeEntry, type EngineConfigs } from "@/lib/sales/pricing";

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
  function pickColor(name: string) {
    const c = style?.colors.find((x) => x.name === name);
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
          <select disabled={!editable} value={line.styleId ?? ""} onChange={(e) => pickStyle(e.target.value)} className={`mt-1 w-full ${inp}`}>
            <option value="">— pick a blank —</option>
            {refs.styles.map((s) => <option key={s.id} value={s.id}>{[s.brand, s.styleNumber].filter(Boolean).join(" ")} {s.name} ({money(s.basePrice)})</option>)}
          </select>
        </label>
        <label className="text-xs text-neutral-500">Color
          <select disabled={!editable || !style} value={line.color ?? ""} onChange={(e) => pickColor(e.target.value)} className={`mt-1 w-full ${inp}`}>
            <option value="">— color —</option>
            {style?.colors.map((c) => <option key={c.name} value={c.name}>{c.name}{c.tierCode ? ` (${c.tierCode})` : ""}</option>)}
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
                  <select disabled={!editable} value={d.stitchTier ?? ""} onChange={(e) => patchDeco(i, { stitchTier: e.target.value })} className={inp} title="Stitch tier">
                    <option value="">— stitch tier —</option>
                    {refs.embTiers.map((t) => <option key={t.code} value={t.code}>{t.name} ({money(t.pricePerUnit)})</option>)}
                  </select>
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
