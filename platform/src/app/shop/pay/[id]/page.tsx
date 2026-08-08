import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { invoices, payments } from "@/db/schema";
import { getCurrentCustomer } from "@/lib/store/customer-auth";
import { stripeConfigured } from "@/lib/payments/stripe";
import { fmtDate } from "@/lib/format";
import { startInvoicePaymentAction } from "./actions";

export const dynamic = "force-dynamic";
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function PayInvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/shop/login");
  const { id } = await params;
  const { err } = await searchParams;

  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, id) });
  if (!inv || !customer.bpId || inv.bpId !== customer.bpId) redirect("/shop/account");

  const paidRow = await db.select({ s: sql<string>`COALESCE(SUM(${payments.amount}),0)` }).from(payments).where(eq(payments.invoiceId, id));
  const balance = Number(inv.total) - Number(paidRow[0]?.s ?? 0);
  const settled = balance <= 0.005 || inv.status === "paid" || inv.status === "void";

  return (
    <div className="mx-auto max-w-md py-12">
      <Link href="/shop/account" className="text-sm text-neutral-500 hover:text-neutral-900">← My account</Link>
      <h1 className="mt-2 text-2xl font-bold text-neutral-900">Pay invoice {inv.invoiceNumber}</h1>

      <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-5 text-sm">
        <div className="flex justify-between"><span className="text-neutral-500">Invoice total</span><span className="font-medium text-neutral-900">{money(Number(inv.total))}</span></div>
        {inv.dueDate && <div className="mt-1 flex justify-between"><span className="text-neutral-500">Due</span><span className="text-neutral-700">{fmtDate(inv.dueDate)}</span></div>}
        <div className="mt-2 flex justify-between border-t border-neutral-100 pt-2"><span className="font-medium text-neutral-700">Balance due</span><span className="text-lg font-bold text-neutral-900">{money(Math.max(0, balance))}</span></div>
      </div>

      {err === "unavailable" && <p className="mt-4 text-sm text-amber-700">Online payment isn&rsquo;t available right now — please contact us to pay this invoice.</p>}

      {settled ? (
        <p className="mt-5 text-sm text-emerald-700">This invoice is fully paid — nothing due. Thank you!</p>
      ) : stripeConfigured() ? (
        <form action={startInvoicePaymentAction} className="mt-5">
          <input type="hidden" name="id" value={inv.id} />
          <button className="w-full rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Pay {money(Math.max(0, balance))} securely →</button>
          <p className="mt-2 text-center text-[11px] text-neutral-400">Secure payment by card. Your card details go directly to our payment processor.</p>
        </form>
      ) : (
        <p className="mt-5 text-sm text-neutral-500">Online payment isn&rsquo;t set up yet. Please contact us to pay this invoice.</p>
      )}
    </div>
  );
}
