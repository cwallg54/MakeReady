import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { journalEntries, journalLines, glAccounts, users } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { postJournalAction, voidJournalAction, deleteDraftJournalAction } from "@/lib/accounting/gl-journal-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const BADGE: Record<string, string> = { draft: "bg-amber-100 text-amber-700", posted: "bg-emerald-100 text-emerald-700", void: "bg-neutral-200 text-neutral-500" };

export default async function JournalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const { id } = await params;
  const { err } = await searchParams;

  const entry = await db.query.journalEntries.findFirst({ where: eq(journalEntries.id, id) });
  if (!entry) notFound();
  const lines = await db
    .select({ id: journalLines.id, debit: journalLines.debit, credit: journalLines.credit, memo: journalLines.memo, code: glAccounts.code, name: glAccounts.name })
    .from(journalLines).innerJoin(glAccounts, eq(glAccounts.id, journalLines.accountId))
    .where(eq(journalLines.entryId, id)).orderBy(asc(journalLines.sortOrder));
  const poster = entry.postedBy ? await db.query.users.findFirst({ where: eq(users.id, entry.postedBy), columns: { name: true } }) : null;

  const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const credit = lines.reduce((s, l) => s + Number(l.credit), 0);

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/accounting/journal" className="text-sm text-neutral-500 hover:text-neutral-900">← Journal</Link>
      <PageHeader
        title={entry.entryNumber}
        description={`${fmtDate(entry.date)}${entry.memo ? ` · ${entry.memo}` : ""}`}
        action={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${BADGE[entry.status] ?? ""}`}>{entry.status}</span>}
      />

      {err && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">{err}</div>}
      {entry.status === "void" && entry.voidReason && <div className="rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">Voided: {entry.voidReason}{entry.voidedAt ? ` · ${fmtDateTime(entry.voidedAt)}` : ""}</div>}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-4 py-2">Account</th><th className="px-4 py-2">Memo</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2"><span className="font-mono text-neutral-500">{l.code}</span> <span className="text-neutral-800">{l.name}</span></td>
                <td className="px-4 py-2 text-neutral-500">{l.memo || "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{Number(l.debit) ? money(Number(l.debit)) : ""}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{Number(l.credit) ? money(Number(l.credit)) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
              <td className="px-4 py-2 text-xs text-neutral-500" colSpan={2}>Totals {debit === credit ? "· balanced" : "· OUT OF BALANCE"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(debit)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(credit)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <p className="text-xs text-neutral-400">
        Source: {entry.source}{entry.source !== "manual" && entry.sourceId ? ` (${entry.sourceId})` : ""}
        {entry.postedAt ? ` · posted ${fmtDateTime(entry.postedAt)}${poster ? ` by ${poster.name}` : ""}` : ""}
      </p>

      {editable && entry.status !== "void" && (
        <Card className="flex flex-wrap items-center gap-3">
          {entry.status === "draft" && (
            <>
              <form action={postJournalAction}><input type="hidden" name="id" value={entry.id} /><button disabled={debit !== credit || debit === 0} className={`rounded-md px-4 py-2 text-sm font-semibold ${debit === credit && debit > 0 ? "bg-neutral-900 text-white hover:bg-neutral-700" : "cursor-not-allowed bg-neutral-100 text-neutral-400"}`}>Post entry</button></form>
              <form action={deleteDraftJournalAction}><input type="hidden" name="id" value={entry.id} /><ConfirmButton message="Delete this draft entry?" className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Delete draft</ConfirmButton></form>
            </>
          )}
          {entry.status === "posted" && (
            <form action={voidJournalAction} className="flex flex-1 items-end gap-2">
              <input type="hidden" name="id" value={entry.id} />
              <label className="flex-1"><span className="mb-1 block text-xs font-medium text-neutral-600">Void reason</span><input name="reason" required placeholder="Why is this being reversed?" className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand" /></label>
              <ConfirmButton message="Void this posted entry? It stays on record but is excluded from balances." className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">Void</ConfirmButton>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
