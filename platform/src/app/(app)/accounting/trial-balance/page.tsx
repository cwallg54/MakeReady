import Link from "next/link";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { trialBalance } from "@/lib/accounting/journal";
import { StatementDoc, StatementPrintStyles, fmtAcct } from "@/components/accounting/statement";
import { PrintButton } from "@/components/accounting/print-button";

export const dynamic = "force-dynamic";
const COMPANY = "Great Mountain West";
const amt = (n: number) => (n ? fmtAcct(n) : "");

export default async function TrialBalancePage() {
  await requireModule("accounting");
  const rows = (await trialBalance()).filter((r) => r.debit !== 0 || r.credit !== 0);

  let totalDr = 0, totalCr = 0;
  const display = rows.map((r) => {
    const net = Math.round((r.debit - r.credit) * 100) / 100;
    const dr = net > 0 ? net : 0;
    const cr = net < 0 ? -net : 0;
    totalDr += dr; totalCr += cr;
    return { ...r, dr, cr };
  });
  const balanced = Math.round((totalDr - totalCr) * 100) / 100 === 0;
  const period = `As of ${DateTime.now().setZone("America/Denver").toFormat("LLLL d, yyyy")}`;

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/accounting" className="text-sm text-neutral-500 hover:text-neutral-900">← Accounting</Link>
        <PrintButton />
      </div>
      <div className="print:hidden"><PageHeader title="Trial Balance" description="Every account's net balance from posted entries. Total debits must equal total credits." /></div>

      <StatementPrintStyles />
      <div id="statement-print">
        <StatementDoc company={COMPANY} title="Trial Balance" period={period}>
          <table className="w-full font-serif text-sm">
            <thead>
              <tr className="border-b border-neutral-400 text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-1 text-left font-semibold">Account</th>
                <th className="w-36 py-1 text-right font-semibold">Debit</th>
                <th className="w-36 py-1 text-right font-semibold">Credit</th>
              </tr>
            </thead>
            <tbody>
              {display.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-neutral-400">No posted activity yet.</td></tr>}
              {display.map((r) => (
                <tr key={r.id}>
                  <td className="py-0.5"><span className="mr-2 text-neutral-400">{r.code}</span>{r.name}</td>
                  <td className="py-0.5 text-right tabular-nums">{amt(r.dr)}</td>
                  <td className="py-0.5 text-right tabular-nums">{amt(r.cr)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-2 text-right">Total</td>
                <td className="pt-2 text-right tabular-nums"><span className="border-t border-b-4 border-double border-neutral-800 px-0.5 py-0.5">{fmtAcct(totalDr, true)}</span></td>
                <td className="pt-2 text-right tabular-nums"><span className="border-t border-b-4 border-double border-neutral-800 px-0.5 py-0.5">{fmtAcct(totalCr, true)}</span></td>
              </tr>
            </tfoot>
          </table>
          {!balanced && <p className="mt-4 text-center text-xs font-semibold text-red-600">Out of balance — total debits do not equal total credits.</p>}
        </StatementDoc>
      </div>

      <p className="text-center text-xs text-neutral-400 print:hidden">Click any account in the <Link href="/accounting/ledger" className="underline">general ledger</Link> to see its detail.</p>
    </div>
  );
}
