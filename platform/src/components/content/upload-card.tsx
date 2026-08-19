import { Card } from "@/components/ui";
import { uploadAssetAction, createCollectionAction } from "@/lib/content/actions";

const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";

/** Collapsible upload + new-collection forms (server component; uses <details>
 *  so no client JS is needed). File uploads run through the upload server action,
 *  which AI-tags and embeds the asset on the server. */
export function UploadCard({ collections }: { collections: { id: string; name: string }[] }) {
  return (
    <Card>
      <details>
        <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-900">＋ Upload an asset</summary>
        <form action={uploadAssetAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label}>File</label>
            <input type="file" name="file" required className="mt-1 block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-neutral-700" />
            <p className="mt-1 text-[11px] text-neutral-400">Images get an AI description + tags automatically. Up to 25 MB.</p>
          </div>
          <div><label className={label}>Title <span className="normal-case text-neutral-400">(optional)</span></label><input name="title" className={input} /></div>
          <div>
            <label className={label}>Collection</label>
            <select name="collectionId" defaultValue="" className={input}><option value="">— None —</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </div>
          <div><label className={label}>Tags <span className="normal-case text-neutral-400">(comma-separated)</span></label><input name="tags" placeholder="moose, national parks, vintage" className={input} /></div>
          <div>
            <label className={label}>Usage rights</label>
            <select name="usageRights" defaultValue="internal" className={input}><option value="internal">Internal</option><option value="unrestricted">Unrestricted</option><option value="client_only">Client-only</option><option value="licensed">Licensed</option></select>
          </div>
          <div className="sm:col-span-2 flex justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Upload</button></div>
        </form>
      </details>

      <details className="mt-3 border-t border-neutral-100 pt-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-neutral-600">＋ New collection</summary>
        <form action={createCollectionAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input name="name" placeholder="Collection name" required className="flex-1 min-w-[10rem] rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input name="description" placeholder="Description (optional)" className="flex-1 min-w-[10rem] rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <button className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Create</button>
        </form>
      </details>
    </Card>
  );
}
