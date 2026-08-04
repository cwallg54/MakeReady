import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canDoArt } from "@/lib/art/access";
import { db } from "@/db";
import { designItems, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";
const PAGE = 50;

const STATUS_BADGE: Record<string, string> = { active: "bg-emerald-100 text-emerald-700", draft: "bg-amber-100 text-amber-700", retired: "bg-neutral-200 text-neutral-600" };
const CATALOGS = ["g54", "esm", "emb", "patch", "osh", "wood", "stain", "royalty", "uvs", "dtf"];

export default async function DesignsPage({ searchParams }: { searchParams: Promise<{ q?: string; catalog?: string; archived?: string; page?: string }> }) {
  const user = await requireUser();
  if (!canDoArt(user.roles)) redirect("/403");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const catalog = sp.catalog && CATALOGS.includes(sp.catalog) ? sp.catalog : null;
  const showArchived = sp.archived === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  const cond: SQL[] = [];
  if (!showArchived) cond.push(eq(designItems.archived, false));
  if (catalog) cond.push(eq(designItems.catalog, catalog));
  if (q) cond.push(or(ilike(designItems.itemNumber, `%${q}%`), ilike(designItems.description, `%${q}%`), ilike(designItems.custNumber, `%${q}%`), ilike(designItems.designBase, `%${q}%`)) as SQL);
  const where = cond.length ? and(...cond) : undefined;

  const [items, [{ total }], [{ exN }], [{ unmatchedN }]] = await Promise.all([
    db.select({ id: designItems.id, itemNumber: designItems.itemNumber, catalog: designItems.catalog, custNumber: designItems.custNumber, description: designItems.description, status: designItems.status, isException: designItems.isException, archived: designItems.archived, company: businessPartners.companyName })
      .from(designItems).leftJoin(businessPartners, eq(designItems.bpId, businessPartners.id))
      .where(where).orderBy(desc(designItems.createdAt)).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ total: count() }).from(designItems).where(where),
    db.select({ exN: count() }).from(designItems).where(and(eq(designItems.isException, true), eq(designItems.archived, false))),
    db.select({ unmatchedN: sql<number>`count(distinct ${designItems.custNumber})::int` }).from(designItems).where(and(sql`${designItems.bpId} is null`, sql`${designItems.custNumber} is not null and ${designItems.custNumber} <> '' and ${designItems.custNumber} <> 'NEW'`, eq(designItems.archived, false))),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number) => { const s = new URLSearchParams(); if (q) s.set("q", q); if (catalog) s.set("catalog", catalog); if (showArchived) s.set("archived", "1"); if (p > 1) s.set("page", String(p)); return `/designs?${s.toString()}`; };

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Design Library"
        description="The barcode book — every design number, customer, description, and barcode. New designs auto-create the inventory item so sales can order right away."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/designs/barcodes" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Barcodes</Link>
            <Link href="/designs/reconcile" className={`rounded-md border px-3 py-2 text-sm font-medium ${unmatchedN > 0 ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>Reconcile{unmatchedN > 0 ? ` (${unmatchedN.toLocaleString()})` : ""}</Link>
            <Link href="/designs/exceptions" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Exceptions{exN > 0 ? ` (${exN})` : ""}</Link>
            <Link href="/designs/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">+ New design</Link>
          </div>
        }
      />

      <Card>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input name="q" defaultValue={q ?? ""} placeholder="Search item #, design, customer, description…" className="min-w-64 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1.5 outline-none focus:border-neutral-500" />
          <select name="catalog" defaultValue={catalog ?? ""} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 outline-none focus:border-neutral-500">
            <option value="">All catalogs</option>
            {CATALOGS.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-neutral-600"><input type="checkbox" name="archived" value="1" defaultChecked={showArchived} className="h-4 w-4" /> include archives</label>
          <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-medium text-neutral-700 hover:bg-neutral-50">Filter</button>
          <span className="ml-auto text-xs text-neutral-400">{total.toLocaleString()} designs</span>
        </form>
      </Card>

      <Card className="p-0">
        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">Item #</th><th className="px-4 py-2">Description</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Catalog</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {items.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No designs match.</td></tr>}
              {items.map((i) => (
                <tr key={i.id} className={`hover:bg-neutral-50 ${i.archived ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2"><Link href={`/designs/${i.id}`} className="font-mono text-xs font-medium text-blue-600 hover:underline">{i.itemNumber}</Link>{i.isException && <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-600">exc</span>}</td>
                  <td className="px-4 py-2 text-neutral-800">{i.description ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{i.company ?? i.custNumber ?? "—"}</td>
                  <td className="px-4 py-2"><span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-600">{i.catalog}</span></td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[i.status]}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile card list */}
        <ul className="divide-y divide-neutral-100 lg:hidden">
          {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-400">No designs match.</li>}
          {items.map((i) => (
            <li key={i.id} className={`px-4 py-3 ${i.archived ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/designs/${i.id}`} className="font-mono text-sm font-medium text-blue-600">{i.itemNumber}</Link>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[i.status]}`}>{i.status}</span>
              </div>
              <div className="mt-1 text-sm text-neutral-800">{i.description ?? "—"}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <span>{i.company ?? i.custNumber ?? "—"}</span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 uppercase text-neutral-600">{i.catalog}</span>
                {i.isException && <span className="rounded bg-red-50 px-1 text-red-600">exc</span>}
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

      <p className="text-xs text-neutral-400">Suffixes and brands are in <Link href="/designs/config" className="text-blue-600 hover:underline">Design settings</Link>. Imported from the Barcode Book — active + archived.</p>
    </div>
  );
}
