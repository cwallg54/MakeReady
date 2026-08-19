import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { listInspections, qualitySummary } from "@/lib/quality/data";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const RESULT_STYLE: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-700",
  fail: "bg-red-100 text-red-700",
  conditional: "bg-amber-100 text-amber-700",
};

export default async function QualityPage() {
  const user = await requireModule("quality");
  const canDo = canEdit(user.roles, "quality");
  const [rows, summary] = await Promise.all([listInspections(), qualitySummary()]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Quality management" description="QC inspections across incoming, in-process, and final stages — pass/fail results, defect tracking, and rework alerts." />
        <div className="flex gap-2">
          <a href="/quality/export" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Export CSV</a>
          {canDo && <Link href="/quality/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">New inspection</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Inspections (30d)" value={summary.total} />
        <StatCard label="Pass rate" value={pct(summary.passRate)} hint={`${summary.fail} failed`} />
        <StatCard label="Defect rate" value={pct(summary.defectRate)} hint={`${summary.rejected} of ${summary.inspected} pcs`} />
        <StatCard label="Units inspected" value={summary.inspected.toLocaleString()} />
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="py-1">Inspection</th><th className="py-1">Order</th><th className="py-1">Customer</th><th className="py-1">Stage</th><th className="py-1 text-right">Insp/Rej</th><th className="py-1">Result</th><th className="py-1">Date</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-neutral-400">No inspections yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="py-1.5"><Link href={`/quality/${r.id}`} className="font-medium text-neutral-900 hover:underline">{r.inspectionNumber}</Link></td>
                <td className="py-1.5 text-neutral-600">{r.orderNumber ?? "—"}</td>
                <td className="py-1.5 text-neutral-600">{r.customer ?? "—"}</td>
                <td className="py-1.5 capitalize text-neutral-500">{r.stage.replace("_", " ")}</td>
                <td className="py-1.5 text-right text-neutral-700">{r.qtyInspected}/{r.qtyRejected}</td>
                <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_STYLE[r.result]}`}>{r.result}</span></td>
                <td className="py-1.5 text-neutral-500">{fmtDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
