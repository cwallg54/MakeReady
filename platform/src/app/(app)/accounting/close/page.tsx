import Link from "next/link";
import { DateTime } from "luxon";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { glClosingDate } from "@/lib/accounting/journal";
import { setGlClosingDateAction } from "@/lib/accounting/close-actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const inp = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";

export default async function PeriodClosePage() {
  const user = await requireModule("accounting");
  if (!canEdit(user.roles, "accounting")) redirect("/accounting");

  const closing = await glClosingDate();
  const settings = await db.query.systemSettings.findFirst({ columns: { glClosingNote: true } });
  const closingStr = closing ? DateTime.fromJSDate(closing).setZone(TZ).toFormat("yyyy-LL-dd") : "";

  return (
    <div className="max-w-2xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link></div>
      <PageHeader title="Period close" description="Lock closed accounting periods so their books can't be changed." />

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Closing date</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Journal entries dated <strong>on or before</strong> the closing date are locked — they can't be created as posted, posted, or voided. Set it to the last day of your most recently closed period (e.g. the end of a closed month or fiscal year). Leave it blank to keep all periods open.
        </p>
        {closing ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            Books are closed through <strong>{DateTime.fromJSDate(closing).setZone(TZ).toFormat("LLLL d, yyyy")}</strong>.
            {settings?.glClosingNote ? ` — ${settings.glClosingNote}` : ""}
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">All periods are currently open.</div>
        )}

        <form action={setGlClosingDateAction} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="mb-1 block text-xs font-medium text-neutral-600">Closing date</span><input name="closingDate" type="date" defaultValue={closingStr} className={inp} /></label>
            <label className="flex-1 min-w-[12rem]"><span className="mb-1 block text-xs font-medium text-neutral-600">Note <span className="text-neutral-400">optional</span></span><input name="note" defaultValue={settings?.glClosingNote ?? ""} placeholder="e.g. FY2025 closed & reviewed" className={`w-full ${inp}`} /></label>
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save closing date</button>
            {closing && <span className="text-xs text-neutral-400">To reopen, clear the date and save.</span>}
          </div>
        </form>
      </Card>

      <p className="text-xs text-neutral-400">Auto-posted entries (invoices, payments, bills) that fall in a closed period are skipped rather than posted — reopen the period if you need them recorded.</p>
    </div>
  );
}
