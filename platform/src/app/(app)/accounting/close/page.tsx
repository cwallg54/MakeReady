import Link from "next/link";
import { DateTime } from "luxon";
import { redirect } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { fiscalPeriods } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { closeChecklist } from "@/lib/accounting/finance-reports";
import { currentPeriod, listPeriods, fiscalStartMonth } from "@/lib/accounting/fiscal-service";
import { fiscalYearOf } from "@/lib/accounting/fiscal";
import { setPeriodStatusAction } from "@/lib/accounting/period-actions";
import { runDueReversalsAction } from "@/lib/accounting/close-actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString()}`;

export default async function PeriodClosePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireModule("accounting");
  const editable = canEdit(user.roles, "accounting");
  const sp = await searchParams;
  const startMonth = await fiscalStartMonth();

  const today = new Date().toISOString().slice(0, 10);
  const cur = await currentPeriod();
  // Default to the month being closed — the one before the current period.
  const periods = await listPeriods(fiscalYearOf(today, startMonth));
  const defaultPeriod =
    periods.find((p) => p.status === "closing") ??
    (cur ? periods.find((p) => p.periodNumber === cur.periodNumber - 1) : undefined) ??
    cur ??
    periods[0];

  const period = sp.period
    ? (await db.query.fiscalPeriods.findFirst({ where: eq(fiscalPeriods.code, sp.period) })) ?? defaultPeriod
    : defaultPeriod;
  if (!period) redirect("/accounting/periods");

  const checks = await closeChecklist(period.startDate, period.endDate);
  const blockers = checks.filter((c) => c.blocking && c.count > 0);
  const advisories = checks.filter((c) => !c.blocking && c.count > 0);
  const ready = blockers.length === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="text-sm">
        <Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link>
      </div>
      <PageHeader
        title="Period close"
        description="Work the checklist, then lock the month. A locked period refuses every posting, void and reversal dated inside it."
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">{period.name}</h2>
            <p className="text-xs text-neutral-500">
              {period.code} · {period.startDate} → {period.endDate} · currently{" "}
              <span className="font-medium">{period.status}</span>
            </p>
          </div>
          <form method="get" className="flex items-end gap-2">
            <select name="period" defaultValue={period.code} className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm">
              {periods.map((p) => (
                <option key={p.id} value={p.code}>{p.code} — {p.name} ({p.status})</option>
              ))}
            </select>
            <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-400">Show</button>
          </form>
        </div>

        <div className="space-y-2">
          {checks.map((c) => {
            const clear = c.count === 0;
            const tone = clear
              ? "border-emerald-200 bg-emerald-50"
              : c.blocking
                ? "border-amber-300 bg-amber-50"
                : "border-neutral-200 bg-neutral-50";
            return (
              <div key={c.key} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${tone}`}>
                <div className="min-w-[14rem] flex-1">
                  <div className="text-sm font-medium text-neutral-900">
                    {clear ? "✓" : c.blocking ? "!" : "•"} {c.label}
                  </div>
                  <div className="text-xs text-neutral-500">{c.detail}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-neutral-900">
                    {clear ? "clear" : `${c.count}${c.amount !== null ? ` · ${money(c.amount)}` : ""}`}
                  </div>
                  {!clear && c.key === "reversals" && editable && (
                    <form action={runDueReversalsAction}>
                      <input type="hidden" name="asOf" value={period.endDate} />
                      <button className="mt-1 rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:border-neutral-400">
                        Post reversals
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {advisories.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            Items marked • don&apos;t block the close — cash genuinely in transit at month end is normal.
          </p>
        )}
      </Card>

      {editable && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Close {period.name}</h2>
          {!ready && (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {blockers.length} item{blockers.length === 1 ? "" : "s"} still outstanding. You can still lock the period, but those
              entries will no longer be postable into it.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {period.status !== "closing" && (
              <form action={setPeriodStatusAction}>
                <input type="hidden" name="periodId" value={period.id} />
                <input type="hidden" name="status" value="closing" />
                <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-400">
                  Mark as closing
                </button>
              </form>
            )}
            {period.status !== "locked" && (
              <form action={setPeriodStatusAction}>
                <input type="hidden" name="periodId" value={period.id} />
                <input type="hidden" name="status" value="locked" />
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
                  Lock the period
                </button>
              </form>
            )}
            {period.status !== "open" && (
              <form action={setPeriodStatusAction}>
                <input type="hidden" name="periodId" value={period.id} />
                <input type="hidden" name="status" value="open" />
                <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:border-neutral-400">
                  Reopen
                </button>
              </form>
            )}
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Every status change is written to the audit log with who did it and when.{" "}
            <Link href="/accounting/periods" className="underline">See every period →</Link>
          </p>
        </Card>
      )}
    </div>
  );
}
