import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productionJobs, orders, businessPartners, orderSpecItems, orderAttachments } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { setJobStatusAction, updateJobAction } from "@/lib/production/actions";
import { Card, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500";
const STATUSES = ["queued", "in_production", "quality_check", "ready_to_ship", "shipped"] as const;
const LABEL: Record<string, string> = { queued: "Queued", in_production: "In production", quality_check: "Quality check", ready_to_ship: "Ready to ship", shipped: "Shipped" };

export default async function ProductionJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("jobs");
  const editable = canEdit(user.roles, "jobs");
  const { id } = await params;

  const job = await db.query.productionJobs.findFirst({ where: eq(productionJobs.id, id) });
  if (!job) notFound();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, job.orderId) });
  if (!order) notFound();
  const bp = order.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : undefined;
  const [specs, attachments] = await Promise.all([
    db.select().from(orderSpecItems).where(eq(orderSpecItems.orderId, order.id)).orderBy(asc(orderSpecItems.sortOrder)),
    db.select({ id: orderAttachments.id, filename: orderAttachments.filename, mimeType: orderAttachments.mimeType, kind: orderAttachments.kind })
      .from(orderAttachments).where(eq(orderAttachments.orderId, order.id)).orderBy(desc(orderAttachments.createdAt)),
  ]);
  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/production" className="text-sm text-neutral-500 hover:text-neutral-900">← Production</Link>
      <PageHeader
        title={`Job · ${order.orderNumber}`}
        description={`${bp?.companyName ?? "Walk-in"}${job.dueDate ? ` · due ${fmtDate(job.dueDate)}` : ""}`}
        action={
          editable ? (
            <form action={setJobStatusAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={job.id} />
              <select name="status" defaultValue={job.status} className={input}>
                {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
              </select>
              <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Set status</button>
            </form>
          ) : (
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">{LABEL[job.status]}</span>
          )
        }
      />

      {editable && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Job notes</h2>
          <form action={updateJobAction} className="space-y-2">
            <input type="hidden" name="id" value={job.id} />
            <textarea name="notes" rows={2} defaultValue={job.notes ?? ""} placeholder="Floor notes…" className={`w-full ${input}`} />
            <label className="flex items-center gap-2 text-sm text-neutral-700"><input type="checkbox" name="rush" defaultChecked={job.rush} className="h-4 w-4" /> Rush</label>
            <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Save</button>
          </form>
          {order.productionNotes && <p className="mt-3 text-xs text-neutral-500">Order notes: {order.productionNotes}</p>}
        </Card>
      )}

      {specs.length > 0 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Production spec</h2>
          <ul className="space-y-2 text-sm">
            {specs.map((s) => (
              <li key={s.id} className="rounded-md border border-neutral-200 px-3 py-2">
                <span className="font-medium text-neutral-900">{s.product || "(item)"}</span>
                <span className="text-neutral-500">
                  {s.decorationMethod ? ` · ${s.decorationMethod}` : ""}{s.placement ? ` · ${s.placement}` : ""}
                  {s.colors ? ` · ${s.colors}` : ""}{s.colorCount ? ` · ${s.colorCount} colors` : ""}{s.sizeBreakdown ? ` · ${s.sizeBreakdown}` : ""}
                </span>
                {s.notes && <p className="text-xs text-neutral-400">{s.notes}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Artwork &amp; references</h2>
        {images.length === 0 ? (
          <p className="text-xs text-neutral-400">No images on this order.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {images.map((a) => (
              <a key={a.id} href={`/art/attachment/${a.id}`} target="_blank" rel="noreferrer" title="Open / download" className="group block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/art/attachment/${a.id}`} alt={a.filename} className="h-28 w-28 rounded-lg border border-neutral-200 object-cover group-hover:ring-2 group-hover:ring-neutral-400" />
                <span className="mt-1 block text-center text-[10px] capitalize text-neutral-400">{a.kind}</span>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
