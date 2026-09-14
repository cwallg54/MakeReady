import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { financePulse, weeklyFlash, type Trend } from "@/lib/accounting/finance-reports";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const money2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";

function Delta({ t }: { t: Trend }) {
  if (t.changePct === null) return <span className="text-xs text-neutral-400">no prior period</span>;
  const good = t.changePct >= 0 === t.upIsGood;
  const arrow = t.changePct >= 0 ? "▲" : "▼";
  return (
    <span className={`text-xs font-medium ${good ? "text-emerald-600" : "text-amber-600"}`}>
      {arrow} {Math.abs(t.changePct).toFixed(0)}% vs last month
    </span>
  );
}

export default async function FlashPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  await requireModule("accounting");
  const sp = await searchParams;
  const anchor = sp.week ? new Date(`${sp.week}T12:00:00`) : new Date();

  const [pulse, flash] = await Promise.all([financePulse(), weeklyFlash(anchor)]);
  const wk = (d: string) => DateTime.fromISO(d).toFormat("LLL d");
  const delta = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 100) : null);

  const cashInDelta = delta(flash.cashIn, flash.priorWeek.cashIn);
  const invoicedDelta = delta(flash.invoiced, flash.priorWeek.invoiced);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden">
        <PageHeader
          title="Weekly flash"
          description="Where the money went this week, and where the business stands right now."
        />
      </div>

      {/* ---- Right now ---- */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Right now</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <div className="text-xs text-neutral-500">Cash on hand</div>
            <div className="text-2xl font-bold text-neutral-900">{money(pulse.cashOnHand)}</div>
            <div className="mt-1 space-y-0.5">
              {pulse.cashAccounts.slice(0, 4).map((a) => (
                <div key={a.code} className="flex justify-between text-[11px] text-neutral-500">
                  <span className="truncate pr-2">{a.name}</span>
                  <span className="tabular-nums">{money(a.balance)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="text-xs text-neutral-500">Money in, month to date</div>
            <div className="text-2xl font-bold text-neutral-900">{money(pulse.incoming.thisPeriod)}</div>
            <Delta t={pulse.incoming} />
          </Card>
          <Card>
            <div className="text-xs text-neutral-500">Money out, month to date</div>
            <div className="text-2xl font-bold text-neutral-900">{money(pulse.outgoing.thisPeriod)}</div>
            <Delta t={pulse.outgoing} />
          </Card>
          <Card>
            <div className="text-xs text-neutral-500">Open receivables</div>
            <div className="text-2xl font-bold text-neutral-900">{money(pulse.arOpen)}</div>
            <div className="text-xs text-neutral-500">
              {pulse.arOverdue > 0 ? <span className="text-amber-600">{money(pulse.arOverdue)} past due</span> : "nothing past due"}
              {pulse.dso !== null && <> · DSO {pulse.dso}d</>}
            </div>
          </Card>
        </div>
      </div>

      {/* ---- The week ---- */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Week of {wk(flash.weekStart)} – {wk(flash.weekEnd)}</h2>
            <p className="text-xs text-neutral-500">Monday to Sunday, compared with the week before.</p>
          </div>
          <form method="get" className="flex items-end gap-2 print:hidden">
            <input name="week" type="date" defaultValue={flash.weekStart} className={inp} />
            <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-400">Go</button>
          </form>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs text-neutral-500">Collected</div>
            <div className="text-xl font-bold text-neutral-900">{money(flash.cashIn)}</div>
            <div className="text-[11px] text-neutral-500">
              prior week {money(flash.priorWeek.cashIn)}
              {cashInDelta !== null && <span className={cashInDelta >= 0 ? " text-emerald-600" : " text-amber-600"}> ({cashInDelta >= 0 ? "+" : ""}{cashInDelta}%)</span>}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs text-neutral-500">Paid out</div>
            <div className="text-xl font-bold text-neutral-900">{money(flash.cashOut)}</div>
            <div className="text-[11px] text-neutral-500">prior week {money(flash.priorWeek.cashOut)}</div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs text-neutral-500">Net cash</div>
            <div className={`text-xl font-bold ${flash.netCash >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(flash.netCash)}</div>
            <div className="text-[11px] text-neutral-500">{flash.depositCount} deposit{flash.depositCount === 1 ? "" : "s"} · {money(flash.deposited)}</div>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <div className="text-xs text-neutral-500">Invoiced</div>
            <div className="text-xl font-bold text-neutral-900">{money(flash.invoiced)}</div>
            <div className="text-[11px] text-neutral-500">
              {flash.invoiceCount} invoice{flash.invoiceCount === 1 ? "" : "s"}
              {invoicedDelta !== null && <span className={invoicedDelta >= 0 ? " text-emerald-600" : " text-amber-600"}> ({invoicedDelta >= 0 ? "+" : ""}{invoicedDelta}%)</span>}
            </div>
          </div>
        </div>

        {(flash.creditsRaised > 0 || flash.newOverdue > 0) && (
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-neutral-600">
            {flash.creditsRaised > 0 && <span>Credits raised: <strong className="text-neutral-900">{money2(flash.creditsRaised)}</strong></span>}
            {flash.newOverdue > 0 && <span>Fell due this week: <strong className="text-amber-700">{money2(flash.newOverdue)}</strong></span>}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Biggest receipts</h2>
          {flash.topReceipts.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">Nothing collected this week.</p>
          ) : (
            <ul className="space-y-1.5">
              {flash.topReceipts.map((r, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-neutral-700">{r.customer}{r.reference ? <span className="text-neutral-400"> · {r.reference}</span> : null}</span>
                  <span className="shrink-0 tabular-nums font-medium text-neutral-900">{money2(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Biggest invoices raised</h2>
          {flash.topInvoices.length === 0 ? (
            <p className="rounded-md bg-neutral-50 px-3 py-4 text-center text-xs text-neutral-500">Nothing invoiced this week.</p>
          ) : (
            <ul className="space-y-1.5">
              {flash.topInvoices.map((r) => (
                <li key={r.number} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-neutral-700">{r.customer} <span className="font-mono text-xs text-neutral-400">{r.number}</span></span>
                  <span className="shrink-0 tabular-nums font-medium text-neutral-900">{money2(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Things waiting on someone</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/accounting/deposits" className="rounded-lg border border-neutral-200 p-3 hover:border-neutral-300">
            <div className="text-xs text-neutral-500">Receipts not banked</div>
            <div className="text-lg font-bold text-neutral-900">{money(pulse.undeposited)}</div>
          </Link>
          <Link href="/accounting/payments" className="rounded-lg border border-neutral-200 p-3 hover:border-neutral-300">
            <div className="text-xs text-neutral-500">Cash on account, unapplied</div>
            <div className="text-lg font-bold text-neutral-900">{money(pulse.unappliedCash)}</div>
          </Link>
          <Link href="/accounting/credit-memos" className="rounded-lg border border-neutral-200 p-3 hover:border-neutral-300">
            <div className="text-xs text-neutral-500">Credits not applied</div>
            <div className="text-lg font-bold text-neutral-900">{money(pulse.openCredits)}</div>
          </Link>
        </div>
      </Card>
    </div>
  );
}
