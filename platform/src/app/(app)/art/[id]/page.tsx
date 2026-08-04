import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { artRequests, orders, businessPartners, orderSpecItems, orderAttachments, orderProofs, designItems, designBrands, designSuffixes } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canDoArt } from "@/lib/art/access";
import { uploadArtAction, sendArtProofAction, setArtStatusAction, updateArtRequestAction } from "@/lib/art/actions";
import { linkExistingDesignToArtAction, unlinkDesignFromArtAction } from "@/lib/designs/actions";
import { Card, PageHeader } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ArtDesignForm } from "./art-design-form";

export const dynamic = "force-dynamic";

const DESIGN_BADGE: Record<string, string> = { active: "bg-emerald-100 text-emerald-700", draft: "bg-amber-100 text-amber-700", retired: "bg-neutral-200 text-neutral-600" };
const ERR_MSG: Record<string, string> = {
  needdesign: "Punch in the orderable design first — an art job can’t be approved or finished until its item number and barcode exist (so sales can order it).",
  exception: "A legacy/ESM design needs a reason before it can be saved.",
  nolink: "No design found with that item number.",
};

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";
const STATUSES = ["todo", "in_progress", "proofing", "revisions", "approved", "done"] as const;
const STATUS_LABEL: Record<string, string> = { todo: "To do", in_progress: "In progress", proofing: "Proofing", revisions: "Revisions", approved: "Approved", done: "Done" };
const PROOF_BADGE: Record<string, string> = { pending: "bg-blue-100 text-blue-700", approved: "bg-emerald-100 text-emerald-700", changes_requested: "bg-amber-100 text-amber-700", declined: "bg-red-100 text-red-700", meeting_requested: "bg-purple-100 text-purple-700" };

export default async function ArtRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canDoArt(user.roles)) redirect("/403");
  const { id } = await params;
  const { err } = await searchParams;

  const req = await db.query.artRequests.findFirst({ where: eq(artRequests.id, id) });
  if (!req) notFound();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, req.orderId) });
  if (!order) notFound();
  const bp = order.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : undefined;
  const [specs, attachments, proofs, design, brands, suffixes] = await Promise.all([
    db.select().from(orderSpecItems).where(eq(orderSpecItems.orderId, order.id)).orderBy(asc(orderSpecItems.sortOrder)),
    db.select({ id: orderAttachments.id, filename: orderAttachments.filename, mimeType: orderAttachments.mimeType, kind: orderAttachments.kind })
      .from(orderAttachments).where(eq(orderAttachments.orderId, order.id)).orderBy(desc(orderAttachments.createdAt)),
    db.select().from(orderProofs).where(eq(orderProofs.orderId, order.id)).orderBy(desc(orderProofs.createdAt)),
    req.designItemId ? db.query.designItems.findFirst({ where: eq(designItems.id, req.designItemId) }) : Promise.resolve(null),
    db.select({ code: designBrands.code, name: designBrands.name, isLegacy: designBrands.isLegacy }).from(designBrands).where(eq(designBrands.active, true)).orderBy(asc(designBrands.sortOrder)),
    db.select({ code: designSuffixes.code, label: designSuffixes.label, kind: designSuffixes.kind }).from(designSuffixes).where(and(eq(designSuffixes.active, true))).orderBy(asc(designSuffixes.sortOrder), asc(designSuffixes.code)),
  ]);
  // Customer number for the design = the account's legacy code without the "C".
  const defaultCustNumber = bp?.legacyCode?.replace(/^C/i, "") ?? "";
  const defaultDescription = specs[0]?.product ?? "";

  const group = (k: string) => attachments.filter((a) => a.kind === k);
  const catalog = group("catalog");
  const customer = attachments.filter((a) => a.kind === "art" || a.kind === "reference");
  const proposed = group("mockup");

  const Thumb = ({ a }: { a: (typeof attachments)[number] }) => {
    const href = `/art/attachment/${a.id}`;
    return (
      <a href={href} target="_blank" rel="noreferrer" title="Open / download original" className="group block">
        {a.mimeType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={href} alt={a.filename} className="h-28 w-28 rounded-lg border border-neutral-200 object-cover group-hover:ring-2 group-hover:ring-neutral-400" />
        ) : (
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-center group-hover:ring-2 group-hover:ring-neutral-400">
            <span className="text-2xl">📄</span>
            <span className="mt-1 line-clamp-2 text-[10px] text-neutral-500">{a.filename}</span>
            <span className="mt-0.5 text-[9px] font-medium text-blue-600">download</span>
          </div>
        )}
      </a>
    );
  };

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/art" className="text-sm text-neutral-500 hover:text-neutral-900">← Art department</Link>
      <PageHeader
        title={`Art request · ${order.orderNumber}`}
        description={`${bp?.companyName ?? "Walk-in"}${req.dueDate ? ` · due ${fmtDate(req.dueDate)}` : ""}`}
        action={
          <form action={setArtStatusAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={req.id} />
            <select name="status" defaultValue={req.status} className={input}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Set status</button>
          </form>
        }
      />

      {err && ERR_MSG[err] && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">{ERR_MSG[err]}</div>
      )}

      {/* Design & orderable item — the required gate */}
      <Card className={design?.status === "active" ? "" : "border-amber-300"}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Design &amp; orderable item</h2>
          {design && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DESIGN_BADGE[design.status] ?? "bg-neutral-100 text-neutral-600"}`}>{design.status === "active" ? "orderable" : design.status}</span>}
        </div>

        {design && design.status === "active" ? (
          /* Orderable — compact confirmation. */
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-mono font-semibold text-neutral-900">{design.itemNumber}</span>
              {design.barcodeNumber && <span className="text-xs text-neutral-500">barcode {design.barcodeNumber}</span>}
              {design.description && <span className="text-xs text-neutral-500">{design.description}</span>}
              <Link href={`/designs/${design.id}`} className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-800">Open in Design Library →</Link>
            </div>
            <p className="text-xs text-emerald-700">✓ The inventory item exists with the art attached — sales can order this. The art job can now be approved.</p>
            <form action={unlinkDesignFromArtAction}>
              <input type="hidden" name="requestId" value={req.id} />
              <button className="text-xs font-medium text-neutral-400 hover:text-neutral-700">Unlink / choose a different design</button>
            </form>
          </div>
        ) : design ? (
          /* Linked but still a draft — the FULL inline edit so it can be finished here. */
          <div className="space-y-4">
            <p className="text-xs text-amber-700">This design is a draft — fill in the rest below and it becomes orderable (no need to leave for the Design Library). The art job can’t be approved until it is.</p>
            <ArtDesignForm
              brands={brands}
              suffixes={suffixes}
              requestId={req.id}
              orderId={order.id}
              defaultCustNumber={defaultCustNumber}
              defaultBpId={order.bpId ?? ""}
              defaultDescription={defaultDescription}
              existing={{
                id: design.id, itemNumber: design.itemNumber, custNumber: design.custNumber, designBase: design.designBase,
                suffix: design.suffix, colorVariant: design.colorVariant, description: design.description, brandCode: design.brandCode,
                printing: design.printing, location: design.location, barcodeNumber: design.barcodeNumber, barcodeSource: design.barcodeSource,
              }}
            />
            <form action={unlinkDesignFromArtAction} className="border-t border-neutral-100 pt-3">
              <input type="hidden" name="requestId" value={req.id} />
              <button className="text-xs font-medium text-neutral-400 hover:text-neutral-700">Unlink this draft / start over</button>
            </form>
          </div>
        ) : (
          /* Nothing linked yet — create or link an existing design. */
          <div className="space-y-4">
            <p className="text-xs text-neutral-500">Punch in the design once — it composes the item number, assigns the barcode, attaches the art, and creates the orderable item automatically. This is required before the art job can be approved, so sales never wait on a manual SAP/Zoey setup.</p>
            <ArtDesignForm
              brands={brands}
              suffixes={suffixes}
              requestId={req.id}
              orderId={order.id}
              defaultCustNumber={defaultCustNumber}
              defaultBpId={order.bpId ?? ""}
              defaultDescription={defaultDescription}
            />
            <form action={linkExistingDesignToArtAction} className="flex items-end gap-2 border-t border-neutral-100 pt-3">
              <input type="hidden" name="requestId" value={req.id} />
              <label className="flex-1">
                <span className="mb-1 block text-xs font-medium text-neutral-600">…or link an existing design (reused artwork)</span>
                <input name="itemNumber" placeholder="Existing item # e.g. BRI010-4015-MF" className={`w-full font-mono ${input}`} />
              </label>
              <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Link</button>
            </form>
          </div>
        )}
      </Card>

      {/* Brief + rush */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Customization brief</h2>
        <form action={updateArtRequestAction} className="space-y-2">
          <input type="hidden" name="id" value={req.id} />
          <textarea name="brief" rows={3} defaultValue={req.brief ?? ""} placeholder="What the customer asked for…" className={`w-full ${input}`} />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" name="rush" defaultChecked={req.rush} className="h-4 w-4" /> Rush
          </label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Save brief</button>
        </form>
        {order.productionNotes && <p className="mt-3 text-xs text-neutral-500">Production notes: {order.productionNotes}</p>}
      </Card>

      {/* Production spec */}
      {specs.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Production spec</h2>
          <ul className="space-y-2 text-sm">
            {specs.map((s) => (
              <li key={s.id} className="rounded-md border border-neutral-200 px-3 py-2">
                <span className="font-medium text-neutral-900">{s.product || "(item)"}</span>
                <span className="text-neutral-500">
                  {s.decorationMethod ? ` · ${s.decorationMethod}` : ""}{s.placement ? ` · ${s.placement}` : ""}
                  {s.colors ? ` · ${s.colors}` : ""}{s.colorCount ? ` · ${s.colorCount} colors` : ""}{s.sizeBreakdown ? ` · ${s.sizeBreakdown}` : ""}
                </span>
                {s.notes && <p className="text-xs text-neutral-400">{s.notes}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Images */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Images</h2>
        {[["From the catalogue", catalog], ["Customer art & references", customer], ["Proposed art", proposed]].map(([label, list]) => (
          <div key={label as string} className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{label as string}</p>
            {(list as typeof attachments).length === 0 ? (
              <p className="text-xs text-neutral-400">None.</p>
            ) : (
              <div className="flex flex-wrap gap-3">{(list as typeof attachments).map((a) => <Thumb key={a.id} a={a} />)}</div>
            )}
          </div>
        ))}
        <form action={uploadArtAction} className="mt-2 flex items-center gap-2 border-t border-neutral-100 pt-3">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="requestId" value={req.id} />
          <input type="file" name="file" accept="image/*,.pdf,.ai,.eps,.psd" className="text-sm text-neutral-600 file:mr-2 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" />
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Upload proposed art</button>
        </form>
      </Card>

      {/* Send proof */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Send a proof to the customer</h2>
        <p className="mb-3 text-xs text-neutral-400">The proof appears on the customer’s tracking link, where they can approve, request changes, decline, or request a meeting.</p>
        <form action={sendArtProofAction} className="space-y-2">
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="requestId" value={req.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <input name="title" placeholder="Proof title (e.g. Front print v1)" className={input} />
            <select name="attachmentId" className={input}>
              <option value="">— choose the art to show —</option>
              {proposed.concat(customer).map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}
            </select>
          </div>
          <textarea name="message" rows={2} placeholder="Optional message to the customer" className={`w-full ${input}`} />
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Send proof</button>
        </form>
      </Card>

      {/* Proof history */}
      {proofs.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Proof history</h2>
          <ul className="space-y-2 text-sm">
            {proofs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 px-3 py-2">
                <div>
                  <span className="font-medium text-neutral-900">{p.title}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${PROOF_BADGE[p.status] ?? "bg-neutral-100 text-neutral-600"}`}>{p.status.replace("_", " ")}</span>
                  {p.signedName && <span className="ml-2 text-xs text-neutral-500">by {p.signedName} · {fmtDateTime(p.respondedAt)}</span>}
                  {p.responseNotes && <p className="text-xs text-neutral-500">“{p.responseNotes}”</p>}
                </div>
                <a href={`/proof/${p.token}`} className="text-xs font-medium text-blue-600 hover:text-blue-800" target="_blank" rel="noreferrer">Open proof link →</a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
