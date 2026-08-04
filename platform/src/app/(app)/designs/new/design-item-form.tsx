"use client";

import { useMemo, useState } from "react";
import { BpSearchSelect } from "@/components/crm/bp-search-select";
import { createDesignItemAction } from "@/lib/designs/actions";

export interface Brand { code: string; name: string; isLegacy: boolean }
export interface Suffix { code: string; label: string; kind: string }

const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

export function DesignItemForm({ brands, suffixes }: { brands: Brand[]; suffixes: Suffix[] }) {
  const [brand, setBrand] = useState(brands.find((b) => !b.isLegacy)?.code ?? "G54");
  const [custNumber, setCustNumber] = useState("");
  const [designBase, setDesignBase] = useState("");
  const [suffix, setSuffix] = useState("");
  const [variant, setVariant] = useState("");
  const [itemNumber, setItemNumber] = useState("");
  const [barcodeSource, setBarcodeSource] = useState<"gmw" | "customer">("gmw");
  const isLegacy = brands.find((b) => b.code === brand)?.isLegacy ?? false;

  // Full # = CustNum-DesignBase[-suffix][variant], e.g. BRI010-4015-MF-1.
  const suggestion = useMemo(() => {
    if (!custNumber || !designBase) return "";
    return `${custNumber}-${designBase}${suffix ? `-${suffix}` : ""}${variant || ""}`;
  }, [custNumber, designBase, suffix, variant]);
  const effectiveItem = itemNumber || suggestion;

  return (
    <form action={createDesignItemAction} className="space-y-5" encType="multipart/form-data">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={lbl}>Customer (optional — fills the number)</span>
          <div><BpSearchSelect name="bpId" placeholder="Search customer…" /></div>
        </label>
        <label>
          <span className={lbl}>Customer number (no “C”, or NEW)</span>
          <input name="custNumber" value={custNumber} onChange={(e) => setCustNumber(e.target.value.toUpperCase())} placeholder="BRI010" className={`${inp} font-mono`} />
        </label>
        <label>
          <span className={lbl}>Design base</span>
          <input name="designBase" value={designBase} onChange={(e) => setDesignBase(e.target.value)} placeholder="4015, AR118237, SS4008…" className={`${inp} font-mono`} />
        </label>
        <label>
          <span className={lbl}>Brand</span>
          <select name="brandCode" value={brand} onChange={(e) => setBrand(e.target.value)} className={inp}>
            {brands.map((b) => <option key={b.code} value={b.code}>{b.name}{b.isLegacy ? " · legacy" : ""}</option>)}
          </select>
        </label>
      </div>

      {isLegacy && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">ESM is legacy — new designs should be G54. This will be flagged as an <strong>exception</strong>. Explain why:</p>
          <input name="exceptionReason" placeholder="Reason for using ESM…" className={`mt-2 ${inp}`} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <label>
          <span className={lbl}>Suffix (product / location)</span>
          <select name="suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} className={inp}>
            <option value="">— none —</option>
            <optgroup label="Location">{suffixes.filter((s) => s.kind === "location").map((s) => <option key={s.code} value={s.code}>{s.code} · {s.label}</option>)}</optgroup>
            <optgroup label="Hardgood">{suffixes.filter((s) => s.kind === "hardgood").map((s) => <option key={s.code} value={s.code}>{s.code} · {s.label}</option>)}</optgroup>
          </select>
        </label>
        <label>
          <span className={lbl}>Color variant</span>
          <input name="colorVariant" value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="-1, -P…" className={inp} />
        </label>
        <label>
          <span className={lbl}>Full item # {suggestion && <span className="text-neutral-400">(suggested)</span>}</span>
          <input name="itemNumber" value={effectiveItem} onChange={(e) => setItemNumber(e.target.value)} placeholder="required to make it orderable" className={`${inp} font-mono`} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label>
          <span className={lbl}>Description</span>
          <input name="description" placeholder="Summer Bloom LC Tan" className={inp} />
        </label>
        <label>
          <span className={lbl}>Printing</span>
          <input name="printing" placeholder="SS, SUB, DTF…" className={inp} />
        </label>
        <label>
          <span className={lbl}>Location</span>
          <input name="location" placeholder="LC, FF/FB…" className={inp} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={lbl}>Barcode</span>
          <select name="barcodeSource" value={barcodeSource} onChange={(e) => setBarcodeSource(e.target.value as "gmw" | "customer")} className={inp}>
            <option value="gmw">Auto-assign GMW 12-digit (052774…)</option>
            <option value="customer">Customer-provided</option>
          </select>
        </label>
        <label>
          <span className={lbl}>{barcodeSource === "customer" ? "Customer barcode number" : "GMW barcode (auto)"}</span>
          <input name="barcodeNumber" placeholder={barcodeSource === "customer" ? "e.g. 052774" : "assigned on save"} disabled={barcodeSource === "gmw"} className={`${inp} font-mono ${barcodeSource === "gmw" ? "bg-neutral-100 text-neutral-400" : ""}`} />
        </label>
      </div>

      <label className="block">
        <span className={lbl}>Art image</span>
        <input name="image" type="file" accept="image/*" className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-neutral-700" />
      </label>

      <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
        {effectiveItem
          ? "This will create the inventory item and attach the art, so sales can order it immediately."
          : "Without an item number it saves as a draft — sales can't order it until the item number and barcode are set (the ordering gate)."}
      </div>

      <button className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Create design</button>
    </form>
  );
}
