import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customerDocuments, businessPartners } from "@/db/schema";
import { Logo } from "@/components/logo";
import { DOC_LABELS } from "@/lib/documents/meta";
import { ApplicationForm } from "./application-form";

export const dynamic = "force-dynamic";

export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const doc = await db.query.customerDocuments.findFirst({ where: eq(customerDocuments.token, token) });

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Logo markClassName="h-16 w-auto" className="mb-8 text-neutral-900" />
        {!doc ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
            <h1 className="text-lg font-semibold text-neutral-900">Link not valid</h1>
            <p className="mt-1 text-sm text-neutral-500">This application link isn&apos;t valid. Please contact Great Mountain West.</p>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold text-neutral-900">{DOC_LABELS[doc.docType]}</h1>
            <p className="mb-6 text-sm text-neutral-500">Please complete and submit securely — nothing you enter here is sent by email.</p>
            <ApplicationForm
              token={token}
              docType={doc.docType}
              defaultCompany={doc.bpId ? (await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, doc.bpId) }))?.companyName ?? "" : ""}
            />
          </>
        )}
        <p className="mt-6 text-center text-xs text-neutral-400">MakeReady by G54 · Commercial Print &amp; Production</p>
      </div>
    </div>
  );
}
