import { DateTime } from "luxon";
import { Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import type { Order, OrderSpecItem, OrderAttachment } from "@/db/schema";
import {
  saveOrderDetailsAction,
  addSpecItemAction,
  updateSpecItemAction,
  removeSpecItemAction,
  uploadAttachmentsAction,
  removeAttachmentAction,
} from "@/lib/orders/detail-actions";

const TZ = "America/Denver";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";
const lbl = "text-xs font-medium text-neutral-500";

export const DECORATION_METHODS = [
  "Screen Print",
  "Embroidery",
  "DTG (Direct-to-Garment)",
  "Heat Transfer / HTV",
  "Sublimation",
  "Vinyl / Cut Vinyl",
  "Laser Engraving",
  "Pad Print",
  "Deboss / Emboss",
  "Sticker / Label",
  "Full-Color / Digital",
  "Other",
];

const KIND_LABELS: Record<string, string> = { art: "Art file", mockup: "Mockup", reference: "Reference", other: "Other" };

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function MethodSelect({ value }: { value: string | null }) {
  return (
    <select name="decorationMethod" defaultValue={value ?? ""} className={inp}>
      <option value="">— method —</option>
      {DECORATION_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  );
}

function SpecFields({ item }: { item?: OrderSpecItem }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
      <label className="col-span-2 sm:col-span-2"><span className={lbl}>Product</span><input name="product" defaultValue={item?.product ?? ""} placeholder="e.g. Navy tee, 16oz mug" className={`mt-1 ${inp}`} /></label>
      <label className="col-span-2 sm:col-span-2"><span className={lbl}>Decoration</span><div className="mt-1"><MethodSelect value={item?.decorationMethod ?? null} /></div></label>
      <label className="col-span-2 sm:col-span-2"><span className={lbl}>Placement</span><input name="placement" defaultValue={item?.placement ?? ""} placeholder="left chest, wrap, full back…" className={`mt-1 ${inp}`} /></label>
      <label className="col-span-2 sm:col-span-3"><span className={lbl}>Colors</span><input name="colors" defaultValue={item?.colors ?? ""} placeholder="ink / thread colors" className={`mt-1 ${inp}`} /></label>
      <label className="sm:col-span-1"><span className={lbl}># colors</span><input name="colorCount" type="number" min="0" defaultValue={item?.colorCount ?? ""} className={`mt-1 ${inp}`} /></label>
      <label className="col-span-2 sm:col-span-2"><span className={lbl}>Sizes / qty breakdown</span><input name="sizeBreakdown" defaultValue={item?.sizeBreakdown ?? ""} placeholder="S:50 M:100 L:100 or N/A" className={`mt-1 ${inp}`} /></label>
      <label className="col-span-2 sm:col-span-6"><span className={lbl}>Item notes</span><input name="notes" defaultValue={item?.notes ?? ""} placeholder="anything production should know" className={`mt-1 ${inp}`} /></label>
    </div>
  );
}

export function ProductionDetails({
  order,
  specItems,
  attachments,
  editable,
}: {
  order: Order;
  specItems: OrderSpecItem[];
  attachments: OrderAttachment[];
  editable: boolean;
}) {
  const inHands = order.inHandsDate ? DateTime.fromJSDate(order.inHandsDate).setZone(TZ).toFormat("yyyy-LL-dd") : "";

  return (
    <>
      <Card className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Production details</h2>
        <p className="mb-4 text-xs text-neutral-500">What the customer wants made — decoration, placement, colors, sizes, and any special instructions.</p>

        {/* Order-level */}
        {editable ? (
          <form action={saveOrderDetailsAction} className="mb-5 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="id" value={order.id} />
            <label className="sm:col-span-1"><span className={lbl}>In-hands date</span><input name="inHandsDate" type="date" defaultValue={inHands} className={`mt-1 ${inp}`} /></label>
            <label className="sm:col-span-2"><span className={lbl}>Special instructions</span><textarea name="productionNotes" rows={2} defaultValue={order.productionNotes ?? ""} placeholder="Ship method, packaging, folding, individual bagging, deadlines…" className={`mt-1 ${inp}`} /></label>
            <div className="sm:col-span-3"><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Save details</button></div>
          </form>
        ) : (
          <dl className="mb-5 grid grid-cols-2 gap-3 text-sm">
            <div><dt className={lbl}>In-hands date</dt><dd className="text-neutral-900">{inHands || "—"}</dd></div>
            <div className="col-span-2"><dt className={lbl}>Special instructions</dt><dd className="whitespace-pre-wrap text-neutral-900">{order.productionNotes || "—"}</dd></div>
          </dl>
        )}

        {/* Spec items */}
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Items &amp; decoration</h3>
        <div className="space-y-3">
          {specItems.length === 0 && !editable && <p className="text-sm text-neutral-400">No item details added.</p>}
          {specItems.map((item) =>
            editable ? (
              <div key={item.id} className="rounded-lg border border-neutral-200 p-3">
                <form action={updateSpecItemAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <SpecFields item={item} />
                  <div className="mt-2">
                    <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">Save item</button>
                  </div>
                </form>
                <form action={removeSpecItemAction} className="mt-1 text-right">
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <ConfirmButton message="Remove this item?" className="text-xs text-red-600 hover:text-red-800">Remove</ConfirmButton>
                </form>
              </div>
            ) : (
              <div key={item.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
                <div className="font-medium text-neutral-900">{item.product}</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-neutral-600">
                  {item.decorationMethod && <span><span className={lbl}>Decoration:</span> {item.decorationMethod}</span>}
                  {item.placement && <span><span className={lbl}>Placement:</span> {item.placement}</span>}
                  {item.colors && <span><span className={lbl}>Colors:</span> {item.colors}{item.colorCount ? ` (${item.colorCount})` : ""}</span>}
                  {item.sizeBreakdown && <span><span className={lbl}>Sizes:</span> {item.sizeBreakdown}</span>}
                </div>
                {item.notes && <div className="mt-1 text-neutral-600"><span className={lbl}>Notes:</span> {item.notes}</div>}
              </div>
            ),
          )}
        </div>

        {editable && (
          <>
            <form action={addSpecItemAction} className="mt-3 rounded-lg border border-dashed border-neutral-300 p-3">
              <input type="hidden" name="orderId" value={order.id} />
              <div className="mb-2 text-xs font-semibold text-neutral-500">Add an item</div>
              <SpecFields />
              <div className="mt-2"><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">+ Add item</button></div>
            </form>
          </>
        )}
      </Card>

      {/* Attachments */}
      <Card className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Attachments</h2>
        <p className="mb-4 text-xs text-neutral-500">Art files, mockups, and reference photos. Images and PDFs preview inline.</p>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {attachments.length === 0 && <p className="text-sm text-neutral-400">No attachments yet.</p>}
          {attachments.map((a) => {
            const url = `/sales/orders/${order.id}/attachment/${a.id}`;
            const isImg = a.mimeType.startsWith("image/");
            return (
              <div key={a.id} className="overflow-hidden rounded-lg border border-neutral-200">
                <a href={url} target="_blank" rel="noreferrer" className="block bg-neutral-50">
                  {isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={a.filename} className="h-32 w-full object-contain" />
                  ) : (
                    <div className="flex h-32 items-center justify-center text-4xl">📄</div>
                  )}
                </a>
                <div className="border-t border-neutral-200 p-2">
                  <a href={url} target="_blank" rel="noreferrer" className="block truncate text-xs font-medium text-neutral-900 hover:underline" title={a.filename}>{a.filename}</a>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-neutral-400">
                    <span>{KIND_LABELS[a.kind] ?? a.kind} · {fmtSize(a.sizeBytes)}</span>
                    {editable && (
                      <form action={removeAttachmentAction}>
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="attachmentId" value={a.id} />
                        <ConfirmButton message="Remove this attachment?" className="text-red-600 hover:text-red-800">Remove</ConfirmButton>
                      </form>
                    )}
                  </div>
                  {a.notes && <div className="mt-1 text-[11px] text-neutral-500">{a.notes}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {editable && (
          <form action={uploadAttachmentsAction} className="rounded-lg border border-dashed border-neutral-300 p-3">
            <input type="hidden" name="orderId" value={order.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="sm:col-span-1"><span className={lbl}>Type</span>
                <select name="kind" className={`mt-1 ${inp}`}>
                  <option value="art">Art file</option>
                  <option value="mockup">Mockup</option>
                  <option value="reference">Reference</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="sm:col-span-2"><span className={lbl}>Note (optional)</span><input name="notes" placeholder="e.g. approved proof, front logo" className={`mt-1 ${inp}`} /></label>
              <label className="sm:col-span-3"><span className={lbl}>Files</span>
                <input name="files" type="file" multiple accept="image/*,application/pdf,.ai,.eps,.psd" className={`mt-1 block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-neutral-700`} />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">Up to 15 MB per file. Images, PDF, AI, EPS, PSD.</p>
            <div className="mt-2"><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Upload</button></div>
          </form>
        )}
      </Card>
    </>
  );
}
