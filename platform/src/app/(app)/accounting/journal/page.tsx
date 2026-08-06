import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { listJournals } from "@/lib/accounting/journal";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BADGE: Record<string, string> = { draft: "bg-amber-100 text-amber-700", posted: "bg-emerald-100 text-emerald-700", void: "bg-neutral-200 text-neutral-500" };

export default async function JournalListPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const entries = await listJournals(200);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link></div>
      <PageHeader
        title="Journal entries"
        description="Every general-ledger transaction. Posted entries roll up into the trial balance and financial statements."
        action={editable ? <Link href="/accounting/journal/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">+ New entry</Link> : undefined}
      />

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-4 py-2">Entry</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Memo</th><th className="px-4 py-2">Source</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {entries.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">No journal entries yet.</td></tr>}
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2"><Link href={`/accounting/journal/${e.id}`} className="font-mono font-medium text-neutral-900 hover:underline">{e.entryNumber}</Link></td>
                <td className="px-4 py-2 text-neutral-500">{fmtDate(e.date)}</td>
                <td className="px-4 py-2 text-neutral-700">{e.memo || "—"}</td>
                <td className="px-4 py-2 text-neutral-400">{e.source}</td>
                <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${BADGE[e.status] ?? ""}`}>{e.status}</span></td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{money(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
