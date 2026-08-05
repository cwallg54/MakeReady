import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { storeCategories } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { createStoreProductAction } from "@/lib/store/actions";

export const dynamic = "force-dynamic";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-brand";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

export default async function NewStoreProductPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireModule("web_store");
  if (!canEdit(user.roles, "web_store")) redirect("/web-store");
  const { err } = await searchParams;
  const cats = await db.select({ id: storeCategories.id, name: storeCategories.name }).from(storeCategories).where(eq(storeCategories.active, true)).orderBy(asc(storeCategories.name));

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader title="New product" description="A standalone store product. To sell a stock item, use “Add from inventory” instead." />
      {err === "title" && <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">A title is required.</div>}

      <form action={createStoreProductAction} className="space-y-4" encType="multipart/form-data">
        <Card className="space-y-4">
          <label className="block"><span className={lbl}>Title</span><input name="title" required className={inp} placeholder="Product name" /></label>
          <label className="block"><span className={lbl}>Description</span><textarea name="description" rows={4} className={inp} /></label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label><span className={lbl}>Retail price ($)</span><input name="retailPrice" type="number" step="0.01" min="0" defaultValue="0" className={inp} /></label>
            <label><span className={lbl}>B2B price ($)</span><input name="b2bPrice" type="number" step="0.01" min="0" placeholder="optional" className={inp} /></label>
            <label>
              <span className={lbl}>Visibility</span>
              <select name="visibility" defaultValue="both" className={inp}>
                <option value="both">Public + B2B</option>
                <option value="public">Public store only</option>
                <option value="b2b">B2B portal only</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className={lbl}>Category</span>
            <select name="categoryId" defaultValue="" className={inp}><option value="">— none —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <label className="block"><span className={lbl}>Image</span><input name="image" type="file" accept="image/*" className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" /></label>
        </Card>
        <button className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Create product</button>
      </form>
    </div>
  );
}
