import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { createAssetAction } from "@/lib/assets/actions";

const CATEGORIES = ["equipment", "vehicle", "furniture", "computer", "building", "leasehold", "other"];
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";

export default async function NewAssetPage() {
  const user = await requireModule("accounting");
  if (!canEdit(user.roles, "accounting")) redirect("/403");

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="New fixed asset" description="Capitalize an asset and set its straight-line depreciation schedule." />
      <Card>
        <form action={createAssetAction} className="space-y-4">
          <div>
            <label className={label}>Asset name</label>
            <input name="name" required placeholder="e.g. M&R Sportsman EX Press" className={input} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Category</label>
              <select name="category" className={input} defaultValue="equipment">
                {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Useful life (months)</label>
              <input name="usefulLifeMonths" type="number" min={1} defaultValue={60} className={input} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={label}>Cost</label>
              <input name="cost" inputMode="decimal" placeholder="0.00" className={input} />
            </div>
            <div>
              <label className={label}>Salvage value</label>
              <input name="salvageValue" inputMode="decimal" placeholder="0.00" className={input} />
            </div>
            <div>
              <label className={label}>Acquisition date</label>
              <input name="acquisitionDate" type="date" className={input} />
            </div>
          </div>
          <div>
            <label className={label}>In-service date <span className="normal-case text-neutral-400">(depreciation begins; defaults to acquisition)</span></label>
            <input name="inServiceDate" type="date" className={input} />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea name="description" rows={2} className={input} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Link href="/accounting/assets" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</Link>
            <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Create asset</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
