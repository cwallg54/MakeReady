import { DateTime } from "luxon";
import { Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { CopyLink } from "@/components/orders/copy-link";
import type { Order, OrderProof, OrderAttachment } from "@/db/schema";
import { createProofAction, deleteProofAction } from "@/lib/orders/proof-actions";

const TZ = "America/Denver";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting customer", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800" },
  changes_requested: { label: "Changes requested", cls: "bg-amber-100 text-amber-800" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-800" },
};

export function OrderProofs({
  order,
  proofs,
  attachments,
  editable,
  baseUrl,
  toEmail,
}: {
  order: Order;
  proofs: OrderProof[];
  attachments: OrderAttachment[];
  editable: boolean;
  baseUrl: string;
  toEmail: string;
}) {
  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold text-neutral-900">Proof approvals</h2>
      <p className="mb-4 text-xs text-neutral-500">Send the customer a secure link to approve artwork. Their decision is recorded with a signature, date, and IP address.</p>

      <div className="mb-4 space-y-3">
        {proofs.length === 0 && <p className="text-sm text-neutral-400">No proofs sent yet.</p>}
        {proofs.map((p) => {
          const url = `${baseUrl}/proof/${p.token}`;
          const s = STATUS[p.status];
          const mailto = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(`Great Mountain West — Proof approval: ${p.title} (${order.orderNumber})`)}&body=${encodeURIComponent(`Hello,\r\n\r\nYour proof for order ${order.orderNumber} is ready to review. Please approve or request changes here:\r\n${url}\r\n\r\nThank you,\r\nGreat Mountain West (G54)`)}`;
          return (
            <div key={p.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-neutral-900">{p.title}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${s?.cls ?? "bg-neutral-100 text-neutral-600"}`}>{s?.label ?? p.status}</span>
              </div>
              {p.status === "pending" ? (
                <>
                  <CopyLink url={url} />
                  <div className="mt-2 flex items-center gap-3">
                    <a href={mailto} className="inline-block rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">✉ Email link to customer</a>
                    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-neutral-500 hover:text-neutral-800">Preview</a>
                    {editable && (
                      <form action={deleteProofAction} className="ml-auto">
                        <input type="hidden" name="orderId" value={order.id} />
                        <input type="hidden" name="proofId" value={p.id} />
                        <ConfirmButton message="Delete this proof request?" className="text-xs text-red-600 hover:text-red-800">Delete</ConfirmButton>
                      </form>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs text-neutral-500">
                  Signed by <span className="font-medium text-neutral-700">{p.signedName ?? "—"}</span>
                  {p.respondedAt ? ` · ${DateTime.fromJSDate(p.respondedAt).setZone(TZ).toFormat("LLL d, yyyy h:mm a")} MT` : ""}
                  {p.ip ? ` · IP ${p.ip}` : ""}
                  {p.responseNotes && <div className="mt-1 whitespace-pre-wrap text-neutral-600">“{p.responseNotes}”</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editable && (
        <form action={createProofAction} className="rounded-lg border border-dashed border-neutral-300 p-3">
          <input type="hidden" name="orderId" value={order.id} />
          <div className="mb-2 text-xs font-semibold text-neutral-500">Send a new proof</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-neutral-500">Title<input name="title" defaultValue={`Proof — ${order.orderNumber}`} className={`mt-1 ${inp}`} /></label>
            <label className="text-xs text-neutral-500">Artwork file
              <select name="attachmentId" className={`mt-1 ${inp}`}>
                <option value="">— none (attach later) —</option>
                {attachments.map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}
              </select>
            </label>
            <label className="text-xs text-neutral-500 sm:col-span-2">Message to customer (optional)<input name="message" placeholder="e.g. Please confirm spelling and colors." className={`mt-1 ${inp}`} /></label>
          </div>
          <div className="mt-2"><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Create proof link</button></div>
          {attachments.length === 0 && <p className="mt-1 text-[11px] text-neutral-400">Tip: upload the artwork under “Attachments” above to include it in the proof.</p>}
        </form>
      )}
    </Card>
  );
}
