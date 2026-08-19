/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";
import { searchAssets, listCollections, assetCount } from "@/lib/content/data";
import { embeddingsAvailable } from "@/lib/content/embeddings";
import { UploadCard } from "@/components/content/upload-card";

export const dynamic = "force-dynamic";

const RIGHTS_STYLE: Record<string, string> = {
  unrestricted: "bg-emerald-100 text-emerald-700",
  internal: "bg-neutral-200 text-neutral-600",
  client_only: "bg-amber-100 text-amber-700",
  licensed: "bg-blue-100 text-blue-700",
};

function Thumb({ id, kind, mime, title }: { id: string; kind: string; mime: string; title: string }) {
  const isImg = mime.startsWith("image/") && !mime.includes("svg");
  if (isImg) return <img src={`/content-library/${id}/file?thumb=1`} alt={title} className="h-36 w-full rounded-t-lg object-cover" />;
  const glyph = kind === "vector" ? "❖" : kind === "document" ? "📄" : "🗂";
  return <div className="flex h-36 w-full items-center justify-center rounded-t-lg bg-neutral-100 text-4xl text-neutral-400">{glyph}</div>;
}

export default async function ContentLibraryPage({ searchParams }: { searchParams: Promise<{ q?: string; collection?: string }> }) {
  const user = await requireModule("content_library");
  const canDo = canEdit(user.roles, "content_library");
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const collectionId = sp.collection || "";
  const [assets, collections, total] = await Promise.all([
    searchAssets({ q, collectionId: collectionId || undefined }),
    listCollections(),
    assetCount(),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Content Library" description={`${total.toLocaleString()} assets. Search by keyword or natural language${embeddingsAvailable() ? " (AI semantic + visual search on)" : ""}, browse collections, and reuse any graphic in seconds.`} />

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={q} placeholder="Search — e.g. “moose graphics for a national parks theme”" className="flex-1 min-w-[16rem] rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        {collectionId && <input type="hidden" name="collection" value={collectionId} />}
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Search</button>
        {(q || collectionId) && <Link href="/content-library" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Clear</Link>}
      </form>

      {collections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Link href={q ? `/content-library?q=${encodeURIComponent(q)}` : "/content-library"} className={`rounded-full px-3 py-1 text-sm ${!collectionId ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>All</Link>
          {collections.map((c) => (
            <Link key={c.id} href={`/content-library?collection=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full px-3 py-1 text-sm ${collectionId === c.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>{c.name} ({c.count})</Link>
          ))}
        </div>
      )}

      {canDo && <UploadCard collections={collections.map((c) => ({ id: c.id, name: c.name }))} />}

      {assets.length === 0 ? (
        <Card><p className="py-6 text-center text-sm text-neutral-400">{q ? "No assets match your search." : "No assets yet. Upload artwork, logos, and mockups to build the library."}</p></Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => (
            <Link key={a.id} href={`/content-library/${a.id}`} className="group overflow-hidden rounded-lg border border-neutral-200 bg-white transition hover:shadow-md">
              <Thumb id={a.id} kind={a.kind} mime={a.mimeType} title={a.title} />
              <div className="p-2">
                <p className="truncate text-sm font-medium text-neutral-900">{a.title}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400">{a.assetNumber}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${RIGHTS_STYLE[a.usageRights] ?? ""}`}>{a.usageRights.replace("_", " ")}</span>
                </div>
                {a.tags && a.tags.length > 0 && <p className="mt-1 truncate text-[10px] text-neutral-400">{a.tags.slice(0, 4).join(" · ")}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
