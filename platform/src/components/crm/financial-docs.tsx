import Link from "next/link";
import { Card } from "@/components/ui";
import { CopyLink } from "@/components/orders/copy-link";
import { createDocumentRequestAction } from "@/lib/documents/actions";
import { DOC_LABELS } from "@/lib/documents/meta";
import { fmtDate } from "@/lib/format";

interface Doc {
  id: string;
  docType: "terms_application" | "credit_card_application";
  token: string;
  status: string;
  createdAt: Date;
  submittedAt: Date | null;
}

export function FinancialDocs({ bpId, docs, baseUrl, editable }: { bpId: string; docs: Doc[]; baseUrl: string; editable: boolean }) {
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-neutral-900">Financial documents</h2>
      <p className="mb-3 text-xs text-neutral-500">Send a secure link for the customer to complete. Nothing sensitive is emailed.</p>

      {editable && (
        <form action={createDocumentRequestAction} className="mb-4 flex gap-2">
          <input type="hidden" name="bpId" value={bpId} />
          <select name="docType" className="flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900">
            <option value="terms_application">Terms / Credit Application (Net 30)</option>
            <option value="credit_card_application">Credit Card Application</option>
          </select>
          <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Request</button>
        </form>
      )}

      <ul className="space-y-3">
        {docs.length === 0 && <li className="text-sm text-neutral-400">No documents requested yet.</li>}
        {docs.map((d) => {
          const url = `${baseUrl}/apply/${d.token}`;
          const mailto = `mailto:?subject=${encodeURIComponent(`Great Mountain West — ${DOC_LABELS[d.docType]}`)}&body=${encodeURIComponent(`Please complete our ${DOC_LABELS[d.docType]} securely here:\r\n${url}\r\n\r\nThank you,\r\nGreat Mountain West (G54)`)}`;
          return (
            <li key={d.id} className="rounded-md border border-neutral-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-800">{DOC_LABELS[d.docType]}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {d.status === "completed" ? "Completed" : "Awaiting customer"}
                </span>
              </div>
              {d.status === "completed" ? (
                <div className="mt-1 text-xs text-neutral-500">
                  Submitted {d.submittedAt ? fmtDate(d.submittedAt) : ""} ·{" "}
                  <Link href={`/crm/${bpId}/document/${d.id}`} className="font-medium text-neutral-700 underline">View submission</Link>
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  <CopyLink url={url} />
                  <a href={mailto} className="inline-block rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">✉ Email link</a>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
