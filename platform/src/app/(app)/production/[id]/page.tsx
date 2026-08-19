/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { productionJobs, orders, businessPartners, orderSpecItems, orderAttachments, pressChecks, users } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { setJobStatusAction, updateJobAction } from "@/lib/production/actions";
import { submitPressCheckAction, decidePressCheckAction, setPressCheckRequiredAction } from "@/lib/production/press-check";
import { Card, PageHeader } from "@/components/ui";
import { JobCostingCard } from "@/components/production/job-costing-card";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PC_ERR: Record<string, string> = {
  nofile: "Please choose a photo of the first-article print.",
  toobig: "That image is too large (15 MB max).",
  type: "Please upload an image (JPG, PNG, HEIC, WebP).",
  pending: "There's already a press check awaiting sign-off.",
  reason: "Please say what needs to change when requesting changes.",
};

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand";
const STATUSES = ["queued", "in_production", "quality_check", "ready_to_ship", "shipped"] as const;
const LABEL: Record<string, string> = { queued: "Queued", in_production: "In production", quality_check: "Quality check", ready_to_ship: "Ready to ship", shipped: "Shipped" };

export default async function ProductionJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gate?: string; pcerr?: string }> }) {
  const user = await requireModule("jobs");
  const editable = canEdit(user.roles, "jobs");
  const canReview = user.roles.some((r) => r === "admin" || r === "art" || r === "sales_manager");
  const { id } = await params;
  const sp = await searchParams;

  const job = await db.query.productionJobs.findFirst({ where: eq(productionJobs.id, id) });
  if (!job) notFound();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, job.orderId) });
  if (!order) notFound();
  const bp = order.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : undefined;
  const [specs, attachments, checks] = await Promise.all([
    db.select().from(orderSpecItems).where(eq(orderSpecItems.orderId, order.id)).orderBy(asc(orderSpecItems.sortOrder)),
    db.select({ id: orderAttachments.id, filename: orderAttachments.filename, mimeType: orderAttachments.mimeType, kind: orderAttachments.kind })
      .from(orderAttachments).where(eq(orderAttachments.orderId, order.id)).orderBy(desc(orderAttachments.createdAt)),
    db.select().from(pressChecks).where(eq(pressChecks.jobId, job.id)).orderBy(asc(pressChecks.attempt)),
  ]);
  // Approved artwork/mockups to compare the first article against.
  const artImages = attachments.filter((a) => a.mimeType.startsWith("image/") && (a.kind === "art" || a.kind === "mockup"));
  const images = attachments.filter((a) => a.mimeType.startsWith("image/") && a.kind !== "press_check");

  // Names for press-check submitters/reviewers.
  const pcUserIds = Array.from(new Set(checks.flatMap((c) => [c.submittedBy, c.reviewedBy]).filter((x): x is string => !!x)));
  const pcNames = pcUserIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, pcUserIds)) : [];
  const nameOf = (uid: string | null) => (uid ? pcNames.find((u) => u.id === uid)?.name ?? "Someone" : "Someone");

  const latestCheck = checks[checks.length - 1];
  const approvedCheck = checks.find((c) => c.status === "approved");
  const pendingCheck = latestCheck?.status === "pending" ? latestCheck : undefined;
  const gateBlocked = sp.gate === "presscheck";
  const pcError = sp.pcerr ? PC_ERR[sp.pcerr] : undefined;

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

      {job.pressCheckRequired ? (
        <Card>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-900">First-article proof (press check)</h2>
            {approvedCheck ? (
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Approved</span>
            ) : pendingCheck ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">Awaiting Art sign-off</span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">Not submitted</span>
            )}
          </div>
          <p className="mb-3 text-xs text-neutral-500">Production prints one item and photographs it here; Art signs off before the full run is released.</p>

          {gateBlocked && !approvedCheck && (
            <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">This job can&rsquo;t start the full run until the press check is approved.</p>
          )}
          {pcError && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{pcError}</p>}

          {approvedCheck && (
            <div className="mb-3 flex items-center gap-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              {approvedCheck.photoAttachmentId && (
                <a href={`/art/attachment/${approvedCheck.photoAttachmentId}`} target="_blank" rel="noreferrer">
                  <img src={`/art/attachment/${approvedCheck.photoAttachmentId}`} alt="Approved first article" className="h-14 w-14 rounded border border-green-200 object-cover" />
                </a>
              )}
              <span>Approved by {nameOf(approvedCheck.reviewedBy)}{approvedCheck.reviewedAt ? ` · ${fmtDate(approvedCheck.reviewedAt)}` : ""}. The full run is released.</span>
            </div>
          )}

          {pendingCheck && (
            <div className="mb-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">First-article photo</p>
                  {pendingCheck.photoAttachmentId ? (
                    <a href={`/art/attachment/${pendingCheck.photoAttachmentId}`} target="_blank" rel="noreferrer">
                      <img src={`/art/attachment/${pendingCheck.photoAttachmentId}`} alt="First-article print" className="max-h-64 w-full rounded-lg border border-neutral-200 object-contain" />
                    </a>
                  ) : <p className="text-xs text-neutral-400">No photo.</p>}
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Approved artwork</p>
                  {artImages.length ? (
                    <div className="flex flex-wrap gap-2">
                      {artImages.map((a) => (
                        <a key={a.id} href={`/art/attachment/${a.id}`} target="_blank" rel="noreferrer">
                          <img src={`/art/attachment/${a.id}`} alt={a.filename} className="h-28 w-28 rounded-lg border border-neutral-200 object-cover" />
                        </a>
                      ))}
                    </div>
                  ) : <p className="text-xs text-neutral-400">No approved artwork on this order.</p>}
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">Submitted by {nameOf(pendingCheck.submittedBy)}{pendingCheck.submittedAt ? ` · ${fmtDate(pendingCheck.submittedAt)}` : ""} · attempt {pendingCheck.attempt}</p>

              {canReview ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <form action={decidePressCheckAction}>
                    <input type="hidden" name="id" value={pendingCheck.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500">Approve — release run</button>
                  </form>
                  <form action={decidePressCheckAction} className="flex flex-1 flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="id" value={pendingCheck.id} />
                    <input type="hidden" name="decision" value="changes" />
                    <input name="note" placeholder="What needs to change?" className={`flex-1 ${input}`} />
                    <button className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-50">Request changes</button>
                  </form>
                </div>
              ) : (
                <p className="mt-3 text-xs text-neutral-500">Waiting on Art to approve or request changes.</p>
              )}
            </div>
          )}

          {!pendingCheck && !approvedCheck && (
            <>
              {latestCheck?.status === "rejected" && (
                <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Changes requested{latestCheck.reviewNote ? `: ${latestCheck.reviewNote}` : ""}. Re-shoot the first article below.</p>
              )}
              {editable ? (
                <form action={submitPressCheckAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input type="hidden" name="jobId" value={job.id} />
                  <input type="file" name="photo" accept="image/*" capture="environment" className="text-sm text-neutral-700" />
                  <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Submit first-article photo</button>
                </form>
              ) : (
                <p className="text-xs text-neutral-500">Waiting for Production to submit the first article.</p>
              )}
            </>
          )}

          {checks.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-neutral-500">History ({checks.length})</summary>
              <ul className="mt-2 space-y-2">
                {[...checks].reverse().map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-md border border-neutral-200 px-3 py-2 text-xs">
                    {c.photoAttachmentId && (
                      <a href={`/art/attachment/${c.photoAttachmentId}`} target="_blank" rel="noreferrer">
                        <img src={`/art/attachment/${c.photoAttachmentId}`} alt="" className="h-12 w-12 rounded border border-neutral-200 object-cover" />
                      </a>
                    )}
                    <div className="flex-1">
                      <span className="font-medium text-neutral-800">Attempt {c.attempt}</span>{" "}
                      <span className={c.status === "approved" ? "text-green-600" : c.status === "rejected" ? "text-amber-600" : "text-neutral-500"}>· {c.status}</span>
                      <p className="text-neutral-500">By {nameOf(c.submittedBy)}{c.submittedAt ? ` · ${fmtDate(c.submittedAt)}` : ""}{c.reviewedBy ? ` → ${nameOf(c.reviewedBy)}` : ""}{c.reviewNote ? ` — ${c.reviewNote}` : ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {editable && !approvedCheck && (
            <form action={setPressCheckRequiredAction} className="mt-3 border-t border-neutral-100 pt-3">
              <input type="hidden" name="jobId" value={job.id} />
              <button className="text-xs font-medium text-neutral-400 hover:text-neutral-700">Skip press check for this job (reorder / exception)</button>
            </form>
          )}
        </Card>
      ) : (
        editable && (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Press check not required</h2>
                <p className="text-xs text-neutral-500">This job skips the first-article sign-off (e.g. a straight reorder).</p>
              </div>
              <form action={setPressCheckRequiredAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="required" value="on" />
                <button className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Require a press check</button>
              </form>
            </div>
          </Card>
        )
      )}

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

      <JobCostingCard jobId={job.id} canEdit={editable} />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Artwork &amp; references</h2>
        {images.length === 0 ? (
          <p className="text-xs text-neutral-400">No images on this order.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {images.map((a) => (
              <a key={a.id} href={`/art/attachment/${a.id}`} target="_blank" rel="noreferrer" title="Open / download" className="group block">
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
