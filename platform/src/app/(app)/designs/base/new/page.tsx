import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canDoArt } from "@/lib/art/access";
import { db } from "@/db";
import { designBrands } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { createBaseDesignAction } from "@/lib/designs/actions";

export const dynamic = "force-dynamic";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

export default async function NewBaseDesignPage() {
  const user = await requireUser();
  if (!canDoArt(user.roles)) redirect("/403");
  const brands = await db.select().from(designBrands).where(eq(designBrands.active, true)).orderBy(asc(designBrands.sortOrder));

  return (
    <div className="max-w-xl space-y-6">
      <Link href="/designs" className="text-sm text-neutral-500 hover:text-neutral-900">← Design Library</Link>
      <PageHeader title="New base design" description="A reusable design. The base number is assigned automatically — you can then apply it to any customer or product." />
      <Card>
        <form action={createBaseDesignAction} className="space-y-4">
          <label className="block"><span className={lbl}>Design name</span><input name="name" required placeholder="Summer Bloom" className={inp} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className={lbl}>Brand</span>
              <select name="brandCode" className={inp}>{brands.map((b) => <option key={b.code} value={b.code}>{b.name}{b.isLegacy ? " · legacy" : ""}</option>)}</select>
            </label>
            <label><span className={lbl}>Release year</span><input name="releaseYear" type="number" placeholder="2027" className={inp} /></label>
          </div>
          <label className="block"><span className={lbl}>Base number (optional — auto-assigned if blank)</span><input name="baseNumber" placeholder="auto" className={`${inp} font-mono`} /></label>
          <label className="block"><span className={lbl}>Notes</span><input name="notes" className={inp} /></label>
          <button className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Create base design</button>
        </form>
      </Card>
    </div>
  );
}
