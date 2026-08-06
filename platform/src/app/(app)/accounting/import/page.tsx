import Link from "next/link";
import { DateTime } from "luxon";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { sql } from "drizzle-orm";
import { importJournalAction, removeEstimatesAction } from "@/lib/accounting/import-actions";

export const dynamic = "force-dynamic";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireModule("accounting");
  if (!canEdit(user.roles, "accounting")) redirect("/accounting");
  const { ok, err } = await searchParams;
  const today = DateTime.now().setZone("America/Denver").toFormat("yyyy-LL-dd");
  const [est] = await db.select({ n: sql<number>`count(*)::int` }).from(journalEntries).where(eq(journalEntries.source, "estimate"));
  const estimateCount = est?.n ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link></div>
      <PageHeader title="Import / migrate to the ledger" description="Post real balances from an export (trial balance, P&L, or expense batch) and retire the modeled estimates." />

      {ok && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{ok}</div>}
      {err && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">{err}</div>}

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Post a batch of GL lines</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Paste rows as <span className="font-mono">account code, debit, credit, memo</span> — one per line. Debits must equal credits; it posts as a single balanced journal entry. Account codes must already exist in the <Link href="/accounting/chart" className="underline">chart of accounts</Link>.
        </p>
        <form action={importJournalAction} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Date</span><input name="date" type="date" defaultValue={today} className={inp} /></label>
            <label className="flex-1 min-w-[12rem]"><span className="mb-1 block text-xs font-medium text-neutral-600">Memo</span><input name="memo" placeholder="e.g. June actuals from QuickBooks" className={inp} /></label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Lines (CSV / TSV)</span>
            <textarea name="csv" rows={8} placeholder={"5000,120000,0,Cost of goods sold\n6000,45000,0,Payroll\n1000,0,165000,Cash paid"} className={`${inp} font-mono`} />
          </label>
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Post entry</button>
        </form>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Retire the modeled estimates</h2>
        <p className="mb-3 text-xs text-neutral-500">
          The ledger was seeded with modeled operating-expense estimates for demonstration. Once your real expenses (bills or an import above) are in, remove them so the statements are 100% actual. There {estimateCount === 1 ? "is" : "are"} currently <strong>{estimateCount}</strong> estimate {estimateCount === 1 ? "entry" : "entries"}.
        </p>
        {estimateCount > 0 ? (
          <form action={removeEstimatesAction}>
            <ConfirmButton message={`Remove all ${estimateCount} modeled estimate entries? This can't be undone (re-run the seed script to restore).`} className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Remove {estimateCount} estimate entries</ConfirmButton>
          </form>
        ) : (
          <p className="text-sm text-emerald-700">✓ No modeled estimates remain — the statements reflect only real postings.</p>
        )}
      </Card>
    </div>
  );
}
