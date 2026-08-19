/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { getAsset } from "@/lib/content/data";
import { updateAssetAction, deleteAssetAction, logUsageAction } from "@/lib/content/actions";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wide text-neutral-500";
const RIGHTS = ["internal", "unrestricted", "client_only", "licensed"];

export default async function AssetDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireModule("content_library");
  const canDo = canEdit(user.roles, "content_library");
  const data = await getAsset(id);
  if (!data) notFound();
  const { asset: a, collectionName, clientName, usage, collections, similar } = data;
  const isImg = a.mimeType.startsWith("image/") && !a.mimeType.includes("svg");

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={a.title} description={`${a.assetNumber} · ${a.kind} · ${(a.sizeBytes / 1024).toFixed(0)} KB${a.aiTagged ? " · AI-tagged" : ""}`} />
        <Link href="/content-library" className="text-sm text-neutral-500 hover:underline">← Library</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          {isImg ? (
            <a href={`/content-library/${a.id}/file`} target="_blank" rel="noreferrer"><img src={`/content-library/${a.id}/file`} alt={a.title} className="mx-auto max-h-96 rounded-lg object-contain" /></a>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg bg-neutral-100 text-5xl text-neutral-400">{a.kind === "vector" ? "❖" : a.kind === "document" ? "📄" : "🗂"}</div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <a href={`/content-library/${a.id}/file`} download className="text-sm font-medium text-neutral-700 hover:underline">Download {a.fileName}</a>
            {clientName && <span className="text-xs text-neutral-500">Client: {clientName}</span>}
          </div>
          {a.description && <p className="mt-3 border-t border-neutral-100 pt-3 text-sm text-neutral-600">{a.description}</p>}
          {a.tags && a.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{a.tags.map((t) => <span key={t} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{t}</span>)}</div>}
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold text-neutral-900">Details</h2>
            <form action={updateAssetAction} className="mt-3 space-y-3">
              <input type="hidden" name="id" value={a.id} />
              <div><label className={label}>Title</label><input name="title" defaultValue={a.title} className={input} disabled={!canDo} /></div>
              <div><label className={label}>Description</label><textarea name="description" rows={3} defaultValue={a.description ?? ""} className={input} disabled={!canDo} /></div>
              <div><label className={label}>Tags</label><input name="tags" defaultValue={(a.tags ?? []).join(", ")} className={input} disabled={!canDo} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Collection</label>
                  <select name="collectionId" defaultValue={a.collectionId ?? ""} className={input} disabled={!canDo}><option value="">— None —</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </div>
                <div>
                  <label className={label}>Usage rights</label>
                  <select name="usageRights" defaultValue={a.usageRights} className={input} disabled={!canDo}>{RIGHTS.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}</select>
                </div>
              </div>
              <input type="hidden" name="clientBpId" value={a.clientBpId ?? ""} />
              <div><label className={label}>Rights note</label><input name="rightsNote" defaultValue={a.rightsNote ?? ""} className={input} disabled={!canDo} /></div>
              {canDo && <div className="flex justify-end"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save</button></div>}
            </form>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-neutral-900">Usage history</h2>
            {usage.length === 0 ? <p className="mt-2 text-sm text-neutral-400">Not used on a job yet.</p> : (
              <ul className="mt-2 space-y-1 text-sm">
                {usage.map((u) => <li key={u.id} className="text-neutral-600">{u.orderNumber ? `${u.orderNumber} — ` : ""}{u.context} <span className="text-xs text-neutral-400">· {u.user} · {fmtDate(u.createdAt)}</span></li>)}
              </ul>
            )}
            {canDo && (
              <form action={logUsageAction} className="mt-3 flex gap-2">
                <input type="hidden" name="assetId" value={a.id} />
                <input name="context" placeholder="e.g. Used on order SO-00123 front print" className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Log use</button>
              </form>
            )}
          </Card>
        </div>
      </div>

      {similar.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Visually similar</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {similar.map((s) => (
              <Link key={s.id} href={`/content-library/${s.id}`} className="overflow-hidden rounded-lg border border-neutral-200 hover:shadow-md">
                {s.mimeType.startsWith("image/") && !s.mimeType.includes("svg")
                  ? <img src={`/content-library/${s.id}/file?thumb=1`} alt={s.title} className="h-20 w-full object-cover" />
                  : <div className="flex h-20 items-center justify-center bg-neutral-100 text-2xl text-neutral-400">❖</div>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {canDo && (
        <Card className="border-red-200 bg-red-50/40">
          <form action={deleteAssetAction} className="flex items-center justify-between">
            <input type="hidden" name="id" value={a.id} />
            <span className="text-sm text-neutral-600">Remove this asset from the library permanently.</span>
            <button className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100">Delete asset</button>
          </form>
        </Card>
      )}
    </div>
  );
}
