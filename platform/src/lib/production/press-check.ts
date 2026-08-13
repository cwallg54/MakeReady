"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productionJobs, pressChecks, orderAttachments, orders, activities, notifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { notifyTeam } from "@/lib/teams/notify";
import { audit } from "@/lib/audit";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_IMAGE = /^image\/(png|jpe?g|gif|webp|heic|heif)$/i;

async function requireProductionEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "jobs") || !canEdit(user.roles, "jobs")) redirect("/403");
  return user;
}

/** Press-check review (Art sign-off) — Art, Sales Manager, or Admin. Production
 *  submits the photo but cannot approve its own first article. */
async function requirePressCheckReview() {
  const user = await getCurrentUser();
  const ok = user && user.roles.some((r) => r === "admin" || r === "art" || r === "sales_manager");
  if (!ok) redirect("/403");
  return user!;
}

/** Whether a job with a press-check requirement has an approved first article. */
export async function pressCheckApproved(jobId: string): Promise<boolean> {
  const row = await db.query.pressChecks.findFirst({
    where: and(eq(pressChecks.jobId, jobId), eq(pressChecks.status, "approved")),
  });
  return !!row;
}

/** Production captures the first-article photo and sends it to Art for sign-off. */
export async function submitPressCheckAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;
  const job = await db.query.productionJobs.findFirst({ where: eq(productionJobs.id, jobId) });
  if (!job) return;

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) redirect(`/production/${jobId}?pcerr=nofile`);
  if (file.size > MAX_FILE_BYTES) redirect(`/production/${jobId}?pcerr=toobig`);
  if (!ALLOWED_IMAGE.test(file.type)) redirect(`/production/${jobId}?pcerr=type`);

  // Don't allow a second pending attempt to pile up.
  const latest = await db.query.pressChecks.findFirst({
    where: eq(pressChecks.jobId, jobId),
    orderBy: [desc(pressChecks.attempt)],
  });
  if (latest?.status === "pending") redirect(`/production/${jobId}?pcerr=pending`);

  const buf = Buffer.from(await file.arrayBuffer());
  const [att] = await db
    .insert(orderAttachments)
    .values({
      orderId: job.orderId,
      filename: file.name.slice(0, 200) || "press-check.jpg",
      mimeType: file.type || "image/jpeg",
      sizeBytes: file.size,
      kind: "press_check",
      contentBase64: buf.toString("base64"),
      uploadedBy: user.id,
    })
    .returning({ id: orderAttachments.id });

  const attempt = (latest?.attempt ?? 0) + 1;
  await db.insert(pressChecks).values({
    jobId,
    orderId: job.orderId,
    attempt,
    photoAttachmentId: att.id,
    submittedBy: user.id,
  });

  const order = await db.query.orders.findFirst({ where: eq(orders.id, job.orderId) });
  await notifyTeam(
    "art",
    {
      type: "press_check",
      title: "Press check — first article needs sign-off",
      body: `Production submitted a first-article photo for order ${order?.orderNumber ?? ""}. Compare it to the approved art and approve or request changes.`.trim(),
      link: `/production/${jobId}`,
    },
    ["art"],
  );
  await audit({ userId: user.id, action: "presscheck.submit", entityType: "production_job", entityId: jobId, metadata: { attempt } });
  revalidatePath(`/production/${jobId}`);
  revalidatePath("/production");
}

/** Art approves (releases the full run) or requests changes (Production re-shoots). */
export async function decidePressCheckAction(formData: FormData): Promise<void> {
  const user = await requirePressCheckReview();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id || (decision !== "approve" && decision !== "changes")) return;
  if (decision === "changes" && !note) {
    const pc0 = await db.query.pressChecks.findFirst({ where: eq(pressChecks.id, id) });
    redirect(`/production/${pc0?.jobId ?? ""}?pcerr=reason`);
  }

  const pc = await db.query.pressChecks.findFirst({ where: eq(pressChecks.id, id) });
  if (!pc || pc.status !== "pending") return;

  const status = decision === "approve" ? "approved" : "rejected";
  await db
    .update(pressChecks)
    .set({ status, reviewedBy: user.id, reviewedAt: new Date(), reviewNote: note || null })
    .where(eq(pressChecks.id, id));

  const order = await db.query.orders.findFirst({ where: eq(orders.id, pc.orderId) });

  // Tell Production the outcome (notify the submitter + the production team).
  const title = status === "approved" ? "Press check approved — run released" : "Press check — changes requested";
  const body =
    status === "approved"
      ? `${user.name} approved the first article for order ${order?.orderNumber ?? ""}. You can start the full run.`
      : `${user.name} requested changes on the first article for order ${order?.orderNumber ?? ""}: ${note}`;
  if (pc.submittedBy) {
    await db.insert(notifications).values({ userId: pc.submittedBy, type: "press_check", title, body, link: `/production/${pc.jobId}` });
  }
  await notifyTeam("production", { type: "press_check", title, body, link: `/production/${pc.jobId}` }, ["production"]);

  if (order?.bpId) {
    await db.insert(activities).values({
      bpId: order.bpId,
      userId: user.id,
      type: status === "approved" ? "other" : "note",
      isSystem: true,
      content:
        status === "approved"
          ? `Press check approved for order ${order.orderNumber} (attempt ${pc.attempt})`
          : `Press check changes requested for order ${order.orderNumber} (attempt ${pc.attempt}) — ${note}`,
    });
    revalidatePath(`/crm/${order.bpId}`);
  }
  await audit({ userId: user.id, action: `presscheck.${status}`, entityType: "press_check", entityId: id });
  revalidatePath(`/production/${pc.jobId}`);
  revalidatePath("/production");
}

/** Toggle whether this job needs a press check (e.g. off for a straight reorder). */
export async function setPressCheckRequiredAction(formData: FormData): Promise<void> {
  const user = await requireProductionEdit();
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;
  const required = formData.get("required") === "on";
  await db.update(productionJobs).set({ pressCheckRequired: required, updatedAt: new Date() }).where(eq(productionJobs.id, jobId));
  await audit({ userId: user.id, action: "presscheck.toggle", entityType: "production_job", entityId: jobId, metadata: { required } });
  revalidatePath(`/production/${jobId}`);
}
