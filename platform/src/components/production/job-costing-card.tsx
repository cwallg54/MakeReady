import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { costCenters } from "@/db/schema";
import { Card } from "@/components/ui";
import { jobCostLines } from "@/lib/controlling/costing";
import { addJobCostAction, removeJobCostAction } from "@/lib/controlling/costing-actions";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm";

/** Actual-cost capture for a production job (labor/material/machine). Feeds job
 *  costing & order profitability in Controlling. */
export async function JobCostingCard({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const [lines, centers] = await Promise.all([
    jobCostLines(jobId),
    db.select().from(costCenters).where(and(eq(costCenters.active, true), eq(costCenters.kind, "department"))).orderBy(costCenters.code),
  ]);
  const total = lines.reduce((s, l) => s + Number(l.amount), 0);

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Job costing</h2>
        <span className="text-sm font-semibold text-neutral-900">{money(total)}</span>
      </div>
      {lines.length === 0 ? (
        <p className="text-xs text-neutral-400">No costs captured yet. Add labor, materials, or machine time to measure this order&apos;s true margin.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5 capitalize text-neutral-500">{l.kind}</td>
                <td className="py-1.5 text-neutral-700">{l.ccCode ?? ""} {l.description ?? ""}{l.minutes ? ` · ${l.minutes}m` : ""}</td>
                <td className="py-1.5 text-right text-neutral-700">{money(Number(l.amount))}</td>
                {canEdit && (
                  <td className="py-1.5 pl-2 text-right">
                    <form action={removeJobCostAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="jobId" value={jobId} /><button className="text-xs text-neutral-400 hover:text-red-600">✕</button></form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && (
        <form action={addJobCostAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3">
          <input type="hidden" name="jobId" value={jobId} />
          <select name="kind" className={input} defaultValue="labor"><option value="labor">Labor</option><option value="material">Material</option><option value="machine">Machine</option><option value="other">Other</option></select>
          <select name="costCenterId" className={input} defaultValue=""><option value="">Cost center…</option>{centers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>
          <input name="minutes" type="number" min={0} placeholder="min" className={`${input} w-20`} />
          <input name="amount" inputMode="decimal" placeholder="$ (auto for labor)" className={`${input} w-32`} />
          <input name="description" placeholder="note" className={`${input} flex-1 min-w-[8rem]`} />
          <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add</button>
        </form>
      )}
    </Card>
  );
}
