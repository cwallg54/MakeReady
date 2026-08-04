import Link from "next/link";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canDoArt } from "@/lib/art/access";
import { db } from "@/db";
import { designBarcodes } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function BarcodesPage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string; page?: string }> }) {
  const user = await requireUser();
  if (!canDoArt(user.roles)) redirect("/403");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const showArchived = sp.archived === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const cond: SQL[] = [];
  if (!showArchived) cond.push(eq(designBarcodes.archived, false));
  if (q) cond.push(or(ilike(designBarcodes.barcode12, `%${q}%`), ilike(designBarcodes.description, `%${q}%`), ilike(designBarcodes.designNumber, `%${q}%`), ilike(designBarcodes.customerBarcode, `%${q}%`)) as SQL);
  const where = cond.length ? and(...cond) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.select().from(designBarcodes).where(where).orderBy(desc(designBarcodes.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(designBarcodes).where(where),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => { const s = new URLSearchParams(); if (q) s.set("q", q); if (showArchived) s.set("archived", "1"); if (p > 1) s.set("page", String(p)); return `/designs/barcodes?${s.toString()}`; };

  return (
    <div className="max-w-5xl space-y-6">
      <Link href="/designs" className="text-sm text-neutral-500 hover:text-neutral-900">← Design Library</Link>
      <PageHeader title="Barcodes" description="Every barcode from the book — GMW 12/10-digit and customer-provided." />
      <Card>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input name="q" defaultValue={q ?? ""} placeholder="Search barcode, design #, description…" className="min-w-64 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 outline-none focus:border-brand" />
          <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" name="archived" value="1" defaultChecked={showArchived} className="h-4 w-4" /> include archives</label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50">Filter</button>
          <span className="ml-auto text-xs text-neutral-400">{total.toLocaleString()} barcodes</span>
        </form>
      </Card>
      <Card className="p-0">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">12-digit</th><th className="px-4 py-2">10-digit</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Design #</th><th className="px-4 py-2">Customer bc</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No barcodes match.</td></tr>}
              {rows.map((b) => (
                <tr key={b.id} className={`hover:bg-neutral-50 ${b.archived ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-800">{b.barcode12 ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-500">{b.barcode10 ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-700">{b.description ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-500">{b.designNumber ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-500">{b.customerBarcode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <ul className="divide-y divide-neutral-100 lg:hidden">
          {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No barcodes match.</li>}
          {rows.map((b) => (
            <li key={b.id} className={`px-4 py-3 ${b.archived ? "opacity-60" : ""}`}>
              <div className="font-mono text-sm font-medium text-neutral-900">{b.barcode12 ?? b.customerBarcode ?? b.barcode10 ?? "—"}</div>
              {b.description && <div className="mt-1 text-sm text-neutral-700">{b.description}</div>}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                {b.designNumber && <span className="font-mono">design {b.designNumber}</span>}
                {b.barcode10 && <span className="font-mono">10-digit {b.barcode10}</span>}
                {b.customerBarcode && b.customerBarcode !== b.barcode12 && <span className="font-mono">cust {b.customerBarcode}</span>}
              </div>
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-neutral-400">Page {page} of {pages.toLocaleString()}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={qs(page - 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">← Prev</Link>}
              {page < pages && <Link href={qs(page + 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">Next →</Link>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
