"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { qualityInspections, qualityDefects, productionJobs, notifications, userRoles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nextDocNumber } from "@/lib/number-series";

/** Notify every user holding one of the given roles. Best-effort. */
async function notifyRoles(roles: ("admin" | "production" | "art" | "sales_manager" | "finance" | "sales_rep")[], title: string, body: string, link: string) {
  try {
    const rows = await db.select({ userId: userRoles.userId }).from(userRoles).where(inArray(userRoles.role, roles));
    const ids = Array.from(new Set(rows.map((r) => r.userId)));
    if (ids.length) await db.insert(notifications).values(ids.map((userId) => ({ userId, type: "quality" as const, title, body, link })));
  } catch { /* best effort */ }
}

async function requireQualityEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "quality") || !canEdit(user.roles, "quality")) redirect("/403");
  return user;
}
const str = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;
const int = (v: FormDataEntryValue | null) => Math.max(0, Math.round(Number(v) || 0));

export async function createInspectionAction(formData: FormData): Promise<void> {
  const user = await requireQualityEdit();
  const jobId = str(formData.get("jobId"));
  let orderId: string | null = null;
  if (jobId) {
    const job = await db.query.productionJobs.findFirst({ where: eq(productionJobs.id, jobId), columns: { orderId: true } });
    orderId = job?.orderId ?? null;
  }
  const inspectionNumber = await nextDocNumber("quality_inspection", "QC-");
  const result = ["pass", "fail", "conditional"].includes(String(formData.get("result"))) ? String(formData.get("result")) : "pass";
  const [insp] = await db.insert(qualityInspections).values({
    inspectionNumber, jobId, orderId,
    stage: ["incoming", "in_process", "final"].includes(String(formData.get("stage"))) ? String(formData.get("stage")) : "final",
    result,
    qtyInspected: int(formData.get("qtyInspected")),
    qtyRejected: int(formData.get("qtyRejected")),
    inspectorId: user.id,
    notes: str(formData.get("notes")),
    createdBy: user.id,
  }).returning({ id: qualityInspections.id, num: qualityInspections.inspectionNumber });
  await audit({ userId: user.id, action: "quality.inspect", entityType: "quality_inspection", entityId: insp.id, metadata: { result } });
  // A failed inspection alerts production so the job is held/reworked.
  if (result === "fail") {
    await notifyRoles(["production", "art"], "QC failure", `Inspection ${insp.num} failed and needs rework.`, `/quality/${insp.id}`);
  }
  redirect(`/quality/${insp.id}`);
}

export async function addDefectAction(formData: FormData): Promise<void> {
  const user = await requireQualityEdit();
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!inspectionId) return;
  await db.insert(qualityDefects).values({
    inspectionId,
    defectType: str(formData.get("defectType")) ?? "other",
    qty: Math.max(1, int(formData.get("qty")) || 1),
    note: str(formData.get("note")),
  });
  await audit({ userId: user.id, action: "quality.defect_add", entityType: "quality_inspection", entityId: inspectionId });
  revalidatePath(`/quality/${inspectionId}`);
}

export async function removeDefectAction(formData: FormData): Promise<void> {
  const user = await requireQualityEdit();
  const id = String(formData.get("id") ?? "");
  const inspectionId = String(formData.get("inspectionId") ?? "");
  if (!id) return;
  await db.delete(qualityDefects).where(eq(qualityDefects.id, id));
  await audit({ userId: user.id, action: "quality.defect_remove", entityType: "quality_inspection", entityId: inspectionId });
  revalidatePath(`/quality/${inspectionId}`);
}
