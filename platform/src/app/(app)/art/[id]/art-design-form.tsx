"use client";

import { useMemo, useState } from "react";
import { createDesignForArtAction, completeDesignForArtAction } from "@/lib/designs/actions";

export interface Brand { code: string; name: string; isLegacy: boolean }
export interface Suffix { code: string; label: string; kind: string }
export interface ExistingDesign {
  id: string; itemNumber: string; custNumber: string | null; designBase: string | null;
  suffix: string | null; colorVariant: string | null; description: string | null;
  brandCode: string; printing: string | null; location: string | null;
  barcodeNumber: string | null; barcodeSource: string;
}

const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

/**
 * Punch in / edit the design for an art job. In "create" mode it makes a new
 * design; in "complete" mode (an existing draft is passed) it edits every field
 * and, once it has an item number + barcode, activates it and creates the item.
 */
export function ArtDesignForm({
  brands, suffixes, requestId, orderId, defaultCustNumber, defaultBpId, defaultDescription, existing,
}: {
  brands: Brand[]; suffixes: Suffix[]; requestId: string; orderId: string;
  defaultCustNumber: string; defaultBpId: string; defaultDescription: string;
  existing?: ExistingDesign;
}) {
  const editing = !!existing;
  const [brand, setBrand] = useState(existing?.brandCode || brands.find((b) => !b.isLegacy)?.code || "G54");
  const [custNumber, setCustNumber] = useState(existing?.custNumber ?? defaultCustNumber);
  const [designBase, setDesignBase] = useState(existing?.designBase ?? "");
  const [suffix, setSuffix] = useState(existing?.suffix ?? "");
  const [variant, setVariant] = useState(existing?.colorVariant ?? "");
  // Never seed the DRAFT- placeholder into the editable field.
  const [itemNumber, setItemNumber] = useState(existing && !existing.itemNumber.startsWith("DRAFT-") ? existing.itemNumber : "");
  const [barcodeSource, setBarcodeSource] = useState<"gmw" | "customer">((existing?.barcodeSource as "gmw" | "customer") || "gmw");
  const isLegacy = brands.find((b) => b.code === brand)?.isLegacy ?? false;

  const suggestion = useMemo(() => {
    if (!custNumber || !designBase) return "";
    return `${custNumber}-${designBase}${suffix ? `-${suffix}` : ""}${variant || ""}`;
  }, [custNumber, designBase, suffix, variant]);
  const effectiveItem = itemNumber || suggestion;

  return (
    <form action={editing ? completeDesignForArtAction : createDesignForArtAction} className="space-y-4" encType="multipart/form-data">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="bpId" value={defaultBpId} />
      {existing && <input type="hidden" name="designItemId" value={existing.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={lbl}>Customer number (no “C”, or NEW)</span>
          <input name="custNumber" value={custNumber} onChange={(e) => setCustNumber(e.target.value.toUpperCase())} placeholder="BRI010" className={`${inp} font-mono`} />
        </label>
        <label>
          <span className={lbl}>Design base</span>
          <input name="designBase" value={designBase} onChange={(e) => setDesignBase(e.target.value)} placeholder="4015, AR118237, SS4008…" className={`${inp} font-mono`} />
        </label>
      </div>

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
          <span className={lbl}>Description</span>
          <input name="description" defaultValue={existing?.description ?? defaultDescription} placeholder="Summer Bloom LC Tan" className={inp} />
        </label>
        <label>
          <span className={lbl}>Printing</span>
          <input name="printing" defaultValue={existing?.printing ?? ""} placeholder="SS, SUB, DTF…" className={inp} />
        </label>
        <label>
          <span className={lbl}>Location</span>
          <input name="location" defaultValue={existing?.location ?? ""} placeholder="LC, FF/FB…" className={inp} />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={lbl}>Full item # {suggestion && !itemNumber && <span className="text-neutral-400">(suggested)</span>}</span>
          <input name="itemNumber" value={effectiveItem} onChange={(e) => setItemNumber(e.target.value)} placeholder="required to make it orderable" className={`${inp} font-mono`} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={lbl}>Barcode</span>
            <select name="barcodeSource" value={barcodeSource} onChange={(e) => setBarcodeSource(e.target.value as "gmw" | "customer")} className={inp}>
              <option value="gmw">Auto GMW (052774…)</option>
              <option value="customer">Customer</option>
            </select>
          </label>
          <label>
            <span className={lbl}>{barcodeSource === "customer" ? "Customer #" : "GMW (auto)"}</span>
            <input name="barcodeNumber" defaultValue={existing?.barcodeNumber ?? ""} placeholder={barcodeSource === "customer" ? "052774…" : "on save"} disabled={barcodeSource === "gmw" && !existing?.barcodeNumber} className={`${inp} font-mono ${barcodeSource === "gmw" && !existing?.barcodeNumber ? "bg-neutral-100 text-neutral-400" : ""}`} />
          </label>
        </div>
      </div>

      <label className="block">
        <span className={lbl}>Art image {editing && "(leave empty to keep the current one)"}</span>
        <input name="image" type="file" accept="image/*" className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-neutral-700" />
      </label>

      <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
        {effectiveItem
          ? "Creates the inventory item with the art attached — sales can order it immediately — and marks this art job's design ready to approve."
          : "Enter the customer number + design base (or a full item number) and a barcode to make it orderable — the art job can't be approved until then."}
      </div>

      <button className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">
        {editing ? "Save design & make orderable" : "Punch in design & create item"}
      </button>
    </form>
  );
}
