import { asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { quotes, quoteLines, quoteCharges, businessPartners } from "@/db/schema";
import { Logo } from "@/components/logo";
import { QuoteDecisionForm } from "./quote-decision-form";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS: Record<string, { label: string; cls: string }> = {
  accepted: { label: "Approved", cls: "bg-emerald-100 text-emerald-800" },
  converted: { label: "Approved — in production", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Declined", cls: "bg-red-100 text-red-800" },
};

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Logo markClassName="h-16 w-auto" className="mb-8 text-neutral-900" />
        {children}
        <p className="mt-6 text-center text-xs text-neutral-400">MakeReady by G54 · Commercial Print &amp; Production</p>
      </div>
    </div>
  );

  const quote = await db.query.quotes.findFirst({ where: eq(quotes.publicToken, token) });
  if (!quote) {
    return shell(
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">Link not valid</h1>
        <p className="mt-1 text-sm text-neutral-500">This quote link isn&apos;t valid. Please contact Great Mountain West.</p>
      </div>,
    );
  }

  const [bp, lines, charges] = await Promise.all([
    quote.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, quote.bpId) }) : Promise.resolve(undefined),
    db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).orderBy(asc(quoteLines.sortOrder)),
    db.select().from(quoteCharges).where(eq(quoteCharges.quoteId, quote.id)),
  ]);
  const decided = !!quote.respondedAt || quote.status === "converted";
  const s = STATUS[quote.status];

  return shell(
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Quote {quote.quoteNumber}{bp ? ` · ${bp.companyName}` : ""}</div>
      <h1 className="text-xl font-bold text-neutral-900">Your quote from Great Mountain West</h1>
      <p className="mt-1 text-sm text-neutral-500">Please review the details below and let us know if it&apos;s approved.</p>

      {/* Line items */}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-400"><th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Unit</th><th className="py-1 text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.length === 0 && <tr><td colSpan={4} className="py-3 text-neutral-400">No line items.</td></tr>}
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1.5 text-neutral-800">{l.description}{l.color ? ` — ${l.color}` : ""}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-600">{l.qty}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-600">{money(Number(l.unitPrice))}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-900">{money(Number(l.extended))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {charges.length > 0 && (
        <div className="mt-3 border-t border-neutral-100 pt-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Charges &amp; setup</div>
          {charges.map((c) => (
            <div key={c.id} className="flex justify-between"><span className="text-neutral-600">{c.label}</span><span className="tabular-nums text-neutral-800">{money(Number(c.amount))}</span></div>
          ))}
        </div>
      )}

      <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Subtotal</span><span className="tabular-nums">{money(Number(quote.subtotal))}</span></div>
        <div className="flex justify-between"><span className="text-neutral-500">Charges</span><span className="tabular-nums">{money(Number(quote.chargesTotal))}</span></div>
        {Number(quote.discount) > 0 && <div className="flex justify-between"><span className="text-neutral-500">Discount</span><span className="tabular-nums">−{money(Number(quote.discount))}</span></div>}
        <div className="flex justify-between border-t border-neutral-200 pt-1 text-base font-semibold text-neutral-900"><span>Total</span><span className="tabular-nums">{money(Number(quote.total))}</span></div>
      </div>

      {quote.notes && <p className="mt-4 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700 whitespace-pre-wrap">{quote.notes}</p>}

      <div className="mt-6">
        {decided ? (
          <div className={`rounded-xl p-5 ${s?.cls ?? "bg-neutral-100 text-neutral-700"}`}>
            <div className="text-sm font-semibold">{s?.label ?? quote.status}</div>
            {quote.signedName && <div className="mt-1 text-sm">Signed by {quote.signedName}{quote.respondedAt ? ` on ${DateTime.fromJSDate(quote.respondedAt).setZone(TZ).toFormat("LLL d, yyyy 'at' h:mm a")} MT` : ""}</div>}
            {quote.responseNote && <div className="mt-2 whitespace-pre-wrap text-sm">“{quote.responseNote}”</div>}
          </div>
        ) : (
          <QuoteDecisionForm token={token} />
        )}
      </div>
    </div>,
  );
}
