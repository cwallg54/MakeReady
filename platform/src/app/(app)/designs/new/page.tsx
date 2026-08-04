import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canDoArt } from "@/lib/art/access";
import { db } from "@/db";
import { baseDesigns, designBrands, designSuffixes } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { DesignItemForm } from "./design-item-form";

export const dynamic = "force-dynamic";

export default async function NewDesignItemPage({ searchParams }: { searchParams: Promise<{ base?: string; err?: string }> }) {
  const user = await requireUser();
  if (!canDoArt(user.roles)) redirect("/403");
  const { base, err } = await searchParams;

  const [bases, brands, suffixes] = await Promise.all([
    db.select({ id: baseDesigns.id, baseNumber: baseDesigns.baseNumber, name: baseDesigns.name, brandCode: baseDesigns.brandCode }).from(baseDesigns).where(eq(baseDesigns.active, true)).orderBy(desc(baseDesigns.createdAt)),
    db.select().from(designBrands).where(eq(designBrands.active, true)).orderBy(asc(designBrands.sortOrder)),
    db.select().from(designSuffixes).where(eq(designSuffixes.active, true)).orderBy(asc(designSuffixes.sortOrder)),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/designs" className="text-sm text-neutral-500 hover:text-neutral-900">← Design Library</Link>
      <PageHeader title="New design item" description="Generate an item number from a base design, attach the art, and it becomes an orderable inventory item." />
      {err === "exception" && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">Please give a reason for the ESM/exception before saving.</div>}
      <Card>
        <DesignItemForm
          bases={bases}
          brands={brands.map((b) => ({ code: b.code, name: b.name, isLegacy: b.isLegacy }))}
          suffixes={suffixes.map((s) => ({ code: s.code, label: s.label, kind: s.kind }))}
          defaultBaseId={base}
        />
      </Card>
    </div>
  );
}
