import Link from "next/link";
import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canDoArt } from "@/lib/art/access";
import { db } from "@/db";
import { designItems } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { BpSearchSelect } from "@/components/crm/bp-search-select";
import { linkCustomerNumberAction } from "@/lib/designs/actions";

export const dynamic = "force-dynamic";
const PAGE = 60;

export default async function ReconcilePage({ searchParams }: { searchParams: Promise<{ archived?: string; page?: string }> }) {
  const user = await requireUser();
  if (!canDoArt(user.roles)) redirect("/403");
  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const page = Math.max(1, Number(sp.page) || 1);

  // Unmatched = a real customer number (not NEW) that didn't link to an account.
  const cond = [isNull(designItems.bpId), sql`${designItems.custNumber} is not null and ${designItems.custNumber} <> ''`, ne(designItems.custNumber, "NEW")];
  if (!includeArchived) cond.push(eq(designItems.archived, false));
  const where = and(...cond);

  const [groups, [{ custN }], [{ designN }]] = await Promise.all([
    db.select({ custNumber: designItems.custNumber, n: count() }).from(designItems).where(where).groupBy(designItems.custNumber).orderBy(desc(count())).limit(PAGE).offset((page - 1) * PAGE),
    db.select({ custN: sql<number>`count(distinct ${designItems.custNumber})::int` }).from(designItems).where(where),
    db.select({ designN: count() }).from(designItems).where(where),
  ]);
  const pages = Math.max(1, Math.ceil((custN ?? 0) / PAGE));
  const qs = (p: number) => { const s = new URLSearchParams(); if (includeArchived) s.set("archived", "1"); if (p > 1) s.set("page", String(p)); return `/designs/reconcile?${s.toString()}`; };

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/designs" className="text-sm text-neutral-500 hover:text-neutral-900">← Design Library</Link>
      <PageHeader title="Customer reconciliation" description="Customer numbers in the Barcode Book that didn't match an account. Link one and every design + barcode with that number is attached to the customer." />

      <div className="grid grid-cols-2 gap-4">
        <Card><div className="text-2xl font-bold text-neutral-900">{(custN ?? 0).toLocaleString()}</div><div className="text-xs text-neutral-500">Unmatched customer numbers</div></Card>
        <Card><div className="text-2xl font-bold text-neutral-900">{(designN ?? 0).toLocaleString()}</div><div className="text-xs text-neutral-500">Designs waiting to be linked</div></Card>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500">Sorted by design count.</span>
        <Link href={includeArchived ? "/designs/reconcile" : "/designs/reconcile?archived=1"} className="ml-auto rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">{includeArchived ? "Hide archives" : "Include archives"}</Link>
      </div>

      <Card className="p-0">
        <ul className="divide-y divide-neutral-100">
          {groups.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-400">Nothing to reconcile. 🎉</li>}
          {groups.map((g) => (
            <li key={g.custNumber} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <Link href={`/designs?q=${encodeURIComponent(g.custNumber ?? "")}${includeArchived ? "&archived=1" : ""}`} className="font-mono text-sm font-semibold text-neutral-900 hover:underline">{g.custNumber}</Link>
                <span className="ml-2 text-xs text-neutral-400">{g.n} design{g.n === 1 ? "" : "s"}</span>
              </div>
              <form action={linkCustomerNumberAction} className="flex items-end gap-2">
                <input type="hidden" name="custNumber" value={g.custNumber ?? ""} />
                <div className="min-w-56"><BpSearchSelect name="bpId" placeholder="Link to customer…" /></div>
                <button className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Link</button>
              </form>
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-5 py-3 text-sm">
            <span className="text-neutral-400">Page {page} of {pages.toLocaleString()}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={qs(page - 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">← Prev</Link>}
              {page < pages && <Link href={qs(page + 1)} className="rounded-md border border-neutral-300 bg-white px-3 py-1 font-medium text-neutral-700 hover:bg-neutral-50">Next →</Link>}
            </div>
          </div>
        )}
      </Card>
      <p className="text-xs text-neutral-400">Linking also backfills the customer&apos;s legacy code (when empty), so a future re-import of the book matches them automatically.</p>
    </div>
  );
}
