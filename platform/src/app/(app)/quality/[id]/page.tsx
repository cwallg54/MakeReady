import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getInspection } from "@/lib/quality/data";
import { addDefectAction, removeDefectAction } from "@/lib/quality/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const input = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm";
const DEFECT_TYPES = ["misprint", "registration", "color", "placement", "stain", "count", "garment", "other"];
const RESULT_STYLE: Record<string, string> = { pass: "bg-emerald-100 text-emerald-700", fail: "bg-red-100 text-red-700", conditional: "bg-amber-100 text-amber-700" };

export default async function InspectionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireModule("quality");
  const canDo = canEdit(user.roles, "quality");
  const data = await getInspection(id);
  if (!data) notFound();
  const { insp, defects, order } = data;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={insp.inspectionNumber} description={`${insp.stage.replace("_", " ")} inspection${order ? ` · order ${order.orderNumber}` : ""}`} />
        <Link href="/quality" className="text-sm text-neutral-500 hover:underline">← All inspections</Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <div><span className="text-neutral-400">Result</span><div><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_STYLE[insp.result]}`}>{insp.result}</span></div></div>
          <div><span className="text-neutral-400">Inspected</span><p className="font-medium text-neutral-900">{insp.qtyInspected}</p></div>
          <div><span className="text-neutral-400">Rejected</span><p className="font-medium text-neutral-900">{insp.qtyRejected}</p></div>
          <div><span className="text-neutral-400">Date</span><p className="text-neutral-700">{fmtDate(insp.createdAt)}</p></div>
        </div>
        {insp.notes && <p className="mt-3 border-t border-neutral-100 pt-3 text-sm text-neutral-600">{insp.notes}</p>}
        {insp.jobId && <Link href={`/production/${insp.jobId}`} className="mt-3 inline-block text-sm text-neutral-500 hover:underline">View production job →</Link>}
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Defects</h2>
        {defects.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-400">No defects recorded.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-neutral-100">
              {defects.map((d) => (
                <tr key={d.id}>
                  <td className="py-1.5 capitalize text-neutral-700">{d.defectType}</td>
                  <td className="py-1.5 text-neutral-500">{d.note}</td>
                  <td className="py-1.5 text-right text-neutral-600">×{d.qty}</td>
                  {canDo && <td className="py-1.5 pl-2 text-right"><form action={removeDefectAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="inspectionId" value={insp.id} /><button className="text-xs text-neutral-400 hover:text-red-600">✕</button></form></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canDo && (
          <form action={addDefectAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
            <input type="hidden" name="inspectionId" value={insp.id} />
            <select name="defectType" className={input} defaultValue="misprint">{DEFECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <input name="qty" type="number" min={1} defaultValue={1} className={`${input} w-20`} />
            <input name="note" placeholder="note" className={`${input} flex-1 min-w-[8rem]`} />
            <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add defect</button>
          </form>
        )}
      </Card>
    </div>
  );
}
