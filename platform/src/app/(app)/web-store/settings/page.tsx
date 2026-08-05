import Link from "next/link";
import { redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getStoreSettings } from "@/lib/store/settings";
import { updateStoreSettingsAction } from "@/lib/store/actions";

export const dynamic = "force-dynamic";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand";
const lbl = "mb-1 block text-xs font-medium text-neutral-600";

export default async function StoreSettingsPage() {
  const user = await requireModule("web_store");
  if (!canEdit(user.roles, "web_store")) redirect("/web-store");
  const s = await getStoreSettings();

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/web-store" className="text-sm text-neutral-500 hover:text-neutral-900">← Web Store</Link>
      <PageHeader title="Storefront settings" description="Branding and open/close controls for the public storefront at /shop." />

      <form action={updateStoreSettingsAction} className="space-y-4">
        <Card className="space-y-4">
          <label className="block"><span className={lbl}>Store name</span><input name="storeName" defaultValue={s.storeName} className={inp} /></label>
          <label className="block"><span className={lbl}>Tagline</span><input name="tagline" defaultValue={s.tagline ?? ""} className={inp} placeholder="Short line shown in the footer" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className={lbl}>Hero headline</span><input name="heroHeadline" defaultValue={s.heroHeadline ?? ""} className={inp} placeholder="The G54 Store" /></label>
            <label className="block"><span className={lbl}>Contact email</span><input name="contactEmail" type="email" defaultValue={s.contactEmail ?? ""} className={inp} /></label>
          </div>
          <label className="block"><span className={lbl}>Hero subtext</span><textarea name="heroSubtext" rows={2} defaultValue={s.heroSubtext ?? ""} className={inp} placeholder="Shop in-stock gear…" /></label>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-900">Availability</h2>
          <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" name="enabled" defaultChecked={s.enabled} className="h-4 w-4" /> Store is open (uncheck to close the storefront entirely)</label>
          <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" name="publicEnabled" defaultChecked={s.publicEnabled} className="h-4 w-4" /> Allow the public to shop (uncheck to require a Business Partner login)</label>
        </Card>

        <div className="flex items-center gap-3">
          <button className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700">Save settings</button>
          <a href="/shop" target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-ink hover:underline">View store ↗</a>
        </div>
      </form>
    </div>
  );
}
