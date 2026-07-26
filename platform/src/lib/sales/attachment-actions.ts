"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { quoteAttachments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, canEdit } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|application\/pdf|application\/postscript|image\/vnd\.adobe\.photoshop|application\/illustrator)$/i;

async function requireSalesEdit() {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales") || !canEdit(user.roles, "sales")) redirect("/403");
  return user;
}

/** Upload customer-provided files to a quote at the intake stage. */
export async function uploadQuoteAttachmentsAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!quoteId) return;
  const kind = String(formData.get("kind") ?? "art");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  let saved = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) continue;
    if (!ALLOWED.test(file.type)) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    await db.insert(quoteAttachments).values({
      quoteId,
      filename: file.name.slice(0, 200),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      kind: ["art", "mockup", "reference", "other"].includes(kind) ? kind : "art",
      contentBase64: buf.toString("base64"),
      notes,
      uploadedBy: user.id,
    });
    saved++;
  }
  await audit({ userId: user.id, action: "quote.attach", entityType: "quote", entityId: quoteId, metadata: { saved } });
  revalidatePath(`/sales/quotes/${quoteId}`);
}

export async function removeQuoteAttachmentAction(formData: FormData): Promise<void> {
  const user = await requireSalesEdit();
  const quoteId = String(formData.get("quoteId") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  if (!quoteId || !attachmentId) return;
  await db.delete(quoteAttachments).where(and(eq(quoteAttachments.id, attachmentId), eq(quoteAttachments.quoteId, quoteId)));
  await audit({ userId: user.id, action: "quote.attach_remove", entityType: "quote", entityId: quoteId });
  revalidatePath(`/sales/quotes/${quoteId}`);
}
