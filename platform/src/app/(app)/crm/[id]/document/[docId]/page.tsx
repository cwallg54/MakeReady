import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { customerDocuments } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { DOC_LABELS, fieldLabel } from "@/lib/documents/meta";

export default async function DocumentSubmissionPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  await requireModule("crm");
  const { id, docId } = await params;
  const doc = await db.query.customerDocuments.findFirst({
    where: and(eq(customerDocuments.id, docId), eq(customerDocuments.bpId, id)),
  });
  if (!doc) notFound();

  const data = (doc.data as Record<string, string> | null) ?? {};
  // Exclude React Server-Action internals ($ACTION_*) that older submissions may contain.
  const entries = Object.entries(data).filter(([k, v]) => v && String(v).trim() && !k.startsWith("$"));

  return (
    <div className="max-w-3xl">
      <Link href={`/crm/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← Business Partner</Link>
      <PageHeader
        title={DOC_LABELS[doc.docType]}
        description={doc.status === "completed" ? `Submitted ${doc.submittedAt ? fmtDateTime(doc.submittedAt) : ""} · Signed: ${doc.signedName ?? "—"}` : "Awaiting customer completion"}
      />
      {doc.status !== "completed" ? (
        <Card><p className="text-sm text-neutral-500">The customer hasn&apos;t submitted this document yet.</p></Card>
      ) : (
        <Card>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {entries.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-neutral-400">{fieldLabel(k)}</dt>
                <dd className="break-words text-sm text-neutral-800">{String(v)}</dd>
              </div>
            ))}
          </dl>
          {doc.ip && <p className="mt-6 text-xs text-neutral-400">Submitted from IP {doc.ip}</p>}
        </Card>
      )}
    </div>
  );
}
