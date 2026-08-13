import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments, businessPartners } from "@/db/schema";
import { stripeConfigured } from "@/lib/payments/stripe";
import { fmtDate } from "@/lib/format";
import { payInvoiceAction } from "./actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function PublicInvoicePayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; err?: string }> }) {
  const { token } = await params;
  const { paid, err } = await searchParams;

  const inv = await db.query.invoices.findFirst({ where: eq(invoices.publicToken, token) });
  if (!inv) notFound();

  const [bp, paidRow, settings] = await Promise.all([
    inv.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, inv.bpId), columns: { companyName: true } }) : Promise.resolve(undefined),
    db.select({ s: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, inv.id)),
    db.query.systemSettings.findFirst({ columns: { cardSurchargePct: true, companyName: true } }),
  ]);
  const balance = Number(inv.total) - Number(paidRow[0]?.s ?? 0);
  const settled = balance <= 0.005 || inv.status === "paid" || inv.status === "void" || !!inv.voidedAt;
  const pct = Number(settings?.cardSurchargePct ?? 0);
  const cardFee = pct > 0 ? balance * (pct / 100) : 0;
  const company = settings?.companyName ?? "Great Mountain West";

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold text-neutral-900">{company}</h1>
        <p className="text-sm text-neutral-500">Invoice {inv.invoiceNumber}{bp?.companyName ? ` · ${bp.companyName}` : ""}</p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Invoice total</span><span className="font-medium text-neutral-900">{money(Number(inv.total))}</span></div>
        {inv.terms && <div className="mt-1 flex justify-between"><span className="text-neutral-500">Terms</span><span className="text-neutral-700">{inv.terms}</span></div>}
        {inv.dueDate && <div className="mt-1 flex justify-between"><span className="text-neutral-500">Due</span><span className="text-neutral-700">{fmtDate(inv.dueDate)}</span></div>}
        <div className="mt-2 flex justify-between border-t border-neutral-100 pt-2"><span className="font-medium text-neutral-700">Balance due</span><span className="text-lg font-bold text-neutral-900">{money(Math.max(0, balance))}</span></div>
      </div>

      {paid && <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Thank you — your payment is processing. This page will show it as paid once it settles.</p>}
      {err === "unavailable" && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Online payment isn&rsquo;t available right now. Please call us or mail a check to pay this invoice.</p>}
      {err === "busy" && <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Too many attempts — please wait a moment and try again.</p>}

      {settled ? (
        <p className="mt-6 rounded-md bg-emerald-50 px-3 py-3 text-center text-sm font-medium text-emerald-700">This invoice is paid in full. Thank you!</p>
      ) : stripeConfigured() ? (
        <div className="mt-6 space-y-3">
          <form action={payInvoiceAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="method" value="ach" />
            <button className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-700">Pay by bank / ACH — {money(Math.max(0, balance))} <span className="font-normal text-neutral-300">(no fee)</span></button>
          </form>
          <form action={payInvoiceAction}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="method" value="card" />
            <button className="w-full rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
              Pay by card — {money(Math.max(0, balance) + cardFee)}
              {pct > 0 && <span className="font-normal text-neutral-500"> (incl. {pct}% card fee {money(cardFee)})</span>}
            </button>
          </form>
          <p className="text-center text-[11px] text-neutral-400">Card details go directly to our payment processor — we never see or store them. Bank/ACH is verified securely by Plaid.</p>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-neutral-500">Online payment isn&rsquo;t set up yet. Please call us or mail a check to pay invoice {inv.invoiceNumber}.</p>
      )}
    </div>
  );
}
