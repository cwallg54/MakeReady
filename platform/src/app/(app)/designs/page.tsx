import Link from "next/link";
import { desc, eq, ilike, or, and, count, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canDoArt } from "@/lib/art/access";
import { db } from "@/db";
import { baseDesigns, designItems, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";

export const dynamic = "force-dynamic";
const PAGE = 40;

const STATUS_BADGE: Record<string, string> = { active: "bg-emerald-100 text-emerald-700", draft: "bg-amber-100 text-amber-700", retired: "bg-neutral-200 text-neutral-600" };

export default async function DesignsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const user = await requireUser();
  if (!canDoArt(user.roles)) redirect("/403");
  const { q, tab } = await searchParams;
  const showBase = tab === "base";

  const itemWhere: SQL[] = [];
  if (q) itemWhere.push(or(ilike(designItems.itemNumber, `%${q}%`), ilike(designItems.suffix, `%${q}%`)) as SQL);
  const baseWhere: SQL[] = [];
  if (q) baseWhere.push(or(ilike(baseDesigns.baseNumber, `%${q}%`), ilike(baseDesigns.name, `%${q}%`)) as SQL);

  const [items, bases, [{ exN }]] = await Promise.all([
    db.select({ id: designItems.id, itemNumber: designItems.itemNumber, brandCode: designItems.brandCode, suffix: designItems.suffix, colorVariant: designItems.colorVariant, barcodeNumber: designItems.barcodeNumber, status: designItems.status, isException: designItems.isException, createdAt: designItems.createdAt, baseName: baseDesigns.name, company: businessPartners.companyName })
      .from(designItems).leftJoin(baseDesigns, eq(designItems.baseDesignId, baseDesigns.id)).leftJoin(businessPartners, eq(designItems.bpId, businessPartners.id))
      .where(itemWhere.length ? and(...itemWhere) : undefined).orderBy(desc(designItems.createdAt)).limit(PAGE),
    db.select().from(baseDesigns).where(baseWhere.length ? and(...baseWhere) : undefined).orderBy(desc(baseDesigns.createdAt)).limit(PAGE),
    db.select({ exN: count() }).from(designItems).where(eq(designItems.isException, true)),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Design Library"
        description="The barcode book — base designs, generated item numbers, art, and barcodes. New designs auto-create the inventory item so sales can order right away."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/designs/exceptions" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Exceptions{exN > 0 ? ` (${exN})` : ""}</Link>
            <Link href="/designs/base/new" className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">+ Base design</Link>
            <Link href="/designs/new" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">+ New item</Link>
          </div>
        }
      />

      <div className="flex items-center gap-2 text-sm">
        <Link href="/designs" className={`rounded-md border px-3 py-1 ${!showBase ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>Items</Link>
        <Link href="/designs?tab=base" className={`rounded-md border px-3 py-1 ${showBase ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>Base designs</Link>
        <form className="ml-auto"><input name="q" defaultValue={q ?? ""} placeholder="Search…" className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500" />{showBase && <input type="hidden" name="tab" value="base" />}</form>
      </div>

      {showBase ? (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">Base #</th><th className="px-4 py-2">Name</th><th className="px-4 py-2">Brand</th><th className="px-4 py-2">Year</th><th className="px-4 py-2" /></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {bases.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No base designs yet.</td></tr>}
              {bases.map((b) => (
                <tr key={b.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2 font-mono text-xs text-neutral-600">{b.baseNumber}</td>
                  <td className="px-4 py-2 font-medium text-neutral-900">{b.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{b.brandCode}</td>
                  <td className="px-4 py-2 text-neutral-500">{b.releaseYear ?? "—"}</td>
                  <td className="px-4 py-2 text-right"><Link href={`/designs/new?base=${b.id}`} className="text-xs font-medium text-blue-600 hover:underline">+ item</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">Item #</th><th className="px-4 py-2">Design</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Barcode</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {items.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No design items yet.</td></tr>}
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2"><Link href={`/designs/${i.id}`} className="font-mono text-xs font-medium text-blue-600 hover:underline">{i.itemNumber}</Link>{i.isException && <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-600">exception</span>}</td>
                  <td className="px-4 py-2 text-neutral-800">{i.baseName ?? "—"}{i.suffix ? ` · ${i.suffix}` : ""}{i.colorVariant ? ` ${i.colorVariant}` : ""}</td>
                  <td className="px-4 py-2 text-neutral-500">{i.company ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-neutral-500">{i.barcodeNumber ?? "—"}</td>
                  <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[i.status]}`}>{i.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-neutral-400">Suffixes and brands are managed in <Link href="/designs/config" className="text-blue-600 hover:underline">Design settings</Link>. Import the full barcode-book spreadsheet to backfill base designs.</p>
    </div>
  );
}
