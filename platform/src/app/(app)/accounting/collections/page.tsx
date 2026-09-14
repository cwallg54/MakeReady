import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { collectionsQueues, parentRollup, CHASE_DAY, type OpenItem } from "@/lib/accounting/collections";
import { markCardChargedAction } from "@/lib/accounting/ar-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmt = (d: Date | null) => (d ? DateTime.fromJSDate(d).setZone(TZ).toFormat("LLL d") : "—");

function Age({ days }: { days: number }) {
  if (days <= 0) return <span className="text-neutral-500">current</span>;
  const tone = days >= 60 ? "text-red-600" : days >= 30 ? "text-amber-600" : "text-neutral-700";
  return <span className={`font-medium ${tone}`}>{days}d</span>;
}

function Queue({
  title,
  hint,
  items,
  editable,
  showCardAction,
  empty,
}: {
  title: string;
  hint: string;
  items: OpenItem[];
  editable: boolean;
  showCardAction?: boolean;
  empty: string;
}) {
  const total = items.reduce((s, i) => s + i.balance, 0);
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        <span className="text-sm font-semibold tabular-nums text-neutral-700">
          {items.length} · {money(total)}
        </span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">{hint}</p>

      {items.length === 0 ? (
        <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Invoice</th>
                <th className="py-2 pr-3">Terms</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2 pr-3">Age</th>
                <th className="py-2 pr-3 text-right">Balance</th>
                {showCardAction && editable && <th className="py-2 text-right">Card</th>}
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 50).map((i) => (
                <tr key={i.id} className="border-b border-neutral-100">
                  <td className="py-2 pr-3">
                    {i.bpId ? (
                      <Link href={`/crm/${i.bpId}`} className="font-medium text-neutral-900 hover:text-brand">{i.customer}</Link>
                    ) : (
                      <span className="text-neutral-700">{i.customer}</span>
                    )}
                    {i.parentName && <div className="text-[11px] text-neutral-400">bills to {i.parentName}</div>}
                  </td>
                  <td className="py-2 pr-3">
                    <Link href={`/accounting/invoices/${i.id}`} className="font-mono text-xs text-neutral-600 hover:text-brand">{i.invoiceNumber}</Link>
                  </td>
                  <td className="py-2 pr-3 text-xs text-neutral-500">{i.termsName ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs text-neutral-500">{fmt(i.dueDate)}</td>
                  <td className="py-2 pr-3 text-xs"><Age days={i.daysPastDue} /></td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium text-neutral-900">{money2(i.balance)}</td>
                  {showCardAction && editable && (
                    <td className="py-2 text-right">
                      <form action={markCardChargedAction} className="inline-flex items-center gap-1">
                        <input type="hidden" name="invoiceId" value={i.id} />
                        <input name="note" placeholder="auth #" className="w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs" />
                        <button className="rounded bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-700">Charged</button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > 50 && <p className="mt-2 text-xs text-neutral-400">Showing the first 50 of {items.length}.</p>}
        </div>
      )}
    </Card>
  );
}

export default async function CollectionsPage() {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const now = new Date();

  const [q, parents] = await Promise.all([collectionsQueues(now), parentRollup(now)]);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Collections"
        description="The AR desk's daily worklists — who to call, whose card to run, and what must be collected before it ships."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open AR" value={money(q.totals.open)} />
        <StatCard label="Past due" value={money(q.totals.overdue)} />
        <StatCard label="On cards" value={money(q.totals.cards)} />
        <StatCard label="Prepay to collect" value={money(q.totals.prepay)} />
      </div>

      <Queue
        title={`Call list — ${CHASE_DAY} days past due`}
        hint={`Accounts that slipped ${CHASE_DAY} days past terms. Chased here before they age into the 30-day bucket.`}
        items={q.chase}
        editable={editable}
        empty="Nobody has hit the chase day. Nothing to call today."
      />

      <Queue
        title="Cards to run today"
        hint="Card-on-file terms falling due today. Run the card, then mark it charged with the auth number."
        items={q.cardsDueToday}
        editable={editable}
        showCardAction
        empty="No cards fall due today."
      />

      <Queue
        title="Cards past due"
        hint="Card-on-file terms already past due and not yet charged — the card either failed or was missed."
        items={q.cardsPastDue}
        editable={editable}
        showCardAction
        empty="Every card-on-file invoice is current."
      />

      <Queue
        title="Prepay / COD outstanding"
        hint="These accounts pay before the goods leave. Anything listed here is unpaid and should not ship."
        items={q.prepayOutstanding}
        editable={editable}
        empty="Nothing outstanding on prepay or COD terms."
      />

      {q.noCredit.length > 0 && (
        <Queue
          title="Accounts on stop"
          hint="Open balances on accounts whose terms refuse credit — collections, closed or do-not-sell."
          items={q.noCredit}
          editable={editable}
          empty=""
        />
      )}

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Open AR by parent account</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Child accounts bill in their own name but settle at the parent — this is the balance the parent is actually chased for.
        </p>
        {parents.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">No open AR.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3 text-right">Accounts billing</th>
                  <th className="py-2 pr-3 text-right">Open</th>
                  <th className="py-2 pr-3 text-right">Past due</th>
                  <th className="py-2 text-right">Oldest</th>
                </tr>
              </thead>
              <tbody>
                {parents.slice(0, 25).map((p) => (
                  <tr key={p.id} className="border-b border-neutral-100">
                    <td className="py-2 pr-3">
                      <Link href={`/crm/${p.id}`} className="font-medium text-neutral-900 hover:text-brand">{p.name}</Link>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">{p.children}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium text-neutral-900">{money2(p.open)}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${p.overdue > 0 ? "font-medium text-red-600" : "text-neutral-400"}`}>{p.overdue > 0 ? money2(p.overdue) : "—"}</td>
                    <td className="py-2 text-right text-xs"><Age days={p.oldestDays} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
