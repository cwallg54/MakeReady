import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { PageHeader, Card } from "@/components/ui";
import { trialBalance } from "@/lib/accounting/journal";
import { ACCOUNT_TYPE_MAP } from "@/lib/accounting/gl";

export const dynamic = "force-dynamic";
const money = (n: number) => (n ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");

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

  return (
    <div className="max-w-3xl space-y-6">
      <div className="text-sm"><Link href="/accounting" className="text-neutral-500 hover:text-neutral-900">← Accounting</Link></div>
      <PageHeader title="Trial balance" description="Every account's net balance from posted journal entries. Total debits must equal total credits." />

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
            <tr><th className="px-4 py-2">Account</th><th className="px-4 py-2">Type</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {display.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">No posted activity yet.</td></tr>}
            {display.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2"><Link href={`/accounting/ledger?account=${r.id}`} className="hover:underline"><span className="font-mono text-neutral-500">{r.code}</span> <span className="text-neutral-800">{r.name}</span></Link></td>
                <td className="px-4 py-2 text-neutral-400">{ACCOUNT_TYPE_MAP[r.type].label}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{money(r.dr)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-neutral-800">{money(r.cr)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className={`border-t-2 font-semibold ${balanced ? "border-neutral-300 bg-neutral-50" : "border-red-300 bg-red-50"}`}>
              <td className="px-4 py-2" colSpan={2}>{balanced ? "Total (balanced)" : "Total — OUT OF BALANCE"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(totalDr)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(totalCr)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
