import { Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDate } from "@/lib/format";
import { uploadCustomerAttachmentAction, deleteCustomerAttachmentAction, sendWelcomeEmailAction } from "@/lib/crm/finance-actions";

const KIND_LABEL: Record<string, string> = {
  experian: "Experian report",
  tax_exempt: "Tax-exempt cert",
  credit_app: "Credit application",
  address_change: "Address change",
  credit_increase: "Credit-limit justification",
  other: "Other",
};

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export interface VaultDoc { id: string; kind: string; filename: string; sizeBytes: number; notes: string | null; createdAt: Date }

/** Finance/Admin-only document vault + welcome email. Never rendered for Sales/Art. */
export function CustomerVault({ bpId, docs, canManage }: { bpId: string; docs: VaultDoc[]; canManage: boolean }) {
  const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500";
  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Finance vault</h2>
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">Finance only</span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">Experian reports, tax-exempt certs, signed credit apps, and other sensitive documents. Not visible to Sales or Art.</p>

      <div className="mb-4 space-y-1">
        {docs.length === 0 && <p className="text-sm text-neutral-400">No documents.</p>}
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-neutral-100 px-3 py-1.5">
            <div className="min-w-0">
              <a href={`/crm/${bpId}/attachment/${d.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-blue-600 hover:underline" title={d.filename}>{d.filename}</a>
              <p className="truncate text-[11px] text-neutral-400"><span className="rounded bg-neutral-100 px-1 text-neutral-600">{KIND_LABEL[d.kind] ?? d.kind}</span> · {fmtSize(d.sizeBytes)} · {fmtDate(d.createdAt)}{d.notes ? ` · ${d.notes}` : ""}</p>
            </div>
            {canManage && (
              <form action={deleteCustomerAttachmentAction}>
                <input type="hidden" name="bpId" value={bpId} />
                <input type="hidden" name="id" value={d.id} />
                <ConfirmButton message="Delete this document?" className="shrink-0 text-xs text-red-600 hover:text-red-800">Delete</ConfirmButton>
              </form>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <form action={uploadCustomerAttachmentAction} className="space-y-2 border-t border-neutral-100 pt-3">
          <input type="hidden" name="bpId" value={bpId} />
          <div className="grid grid-cols-2 gap-2">
            <select name="kind" className={inp} defaultValue="experian">
              {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input name="notes" placeholder="Note (optional)" className={inp} />
          </div>
          <input name="files" type="file" multiple accept="application/pdf,image/*" className="block w-full text-sm text-neutral-600 file:mr-2 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
          <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Upload document</button>
        </form>
      )}

      {canManage && (
        <form action={sendWelcomeEmailAction} className="mt-4 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
          <input type="hidden" name="bpId" value={bpId} />
          <span className="text-xs text-neutral-500">Send the customer a welcome / account-approved email.</span>
          <button className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Send welcome</button>
        </form>
      )}
    </Card>
  );
}
