import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { orderProofs, orders, businessPartners, orderAttachments } from "@/db/schema";
import { Logo } from "@/components/logo";
import { ProofDecisionForm } from "./proof-decision-form";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";

const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800" },
  changes_requested: { label: "Changes requested", cls: "bg-amber-100 text-amber-800" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-800" },
};

export default async function ProofPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Logo markClassName="h-10 w-auto" className="mb-8 text-neutral-900" />
        {children}
        <p className="mt-6 text-center text-xs text-neutral-400">MakeReady by G54 · Commercial Print &amp; Production</p>
      </div>
    </div>
  );

  const proof = await db.query.orderProofs.findFirst({ where: eq(orderProofs.token, token) });
  if (!proof) {
    return shell(
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">Link not valid</h1>
        <p className="mt-1 text-sm text-neutral-500">This proof approval link isn&apos;t valid. Please contact Great Mountain West.</p>
      </div>,
    );
  }

  const order = await db.query.orders.findFirst({ where: eq(orders.id, proof.orderId) });
  const bp = order?.bpId ? await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : undefined;
  const att = proof.attachmentId ? await db.query.orderAttachments.findFirst({ where: eq(orderAttachments.id, proof.attachmentId) }) : undefined;
  const isImg = att?.mimeType.startsWith("image/");
  const imgUrl = `/proof/${token}/image`;
  const decided = proof.status !== "pending";
  const s = STATUS[proof.status];

  return shell(
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {order ? `Order ${order.orderNumber}` : "Proof approval"}{bp ? ` · ${bp.companyName}` : ""}
      </div>
      <h1 className="text-xl font-bold text-neutral-900">{proof.title}</h1>
      <p className="mt-1 text-sm text-neutral-500">Please review your artwork proof below and let us know if it&apos;s approved.</p>

      {proof.message && <p className="mt-4 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{proof.message}</p>}

      {/* Proof artwork */}
      <div className="my-5 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
        {att ? (
          isImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgUrl} alt={proof.title} className="mx-auto block max-h-[60vh] w-auto" />
          ) : (
            <a href={imgUrl} target="_blank" rel="noreferrer" className="flex h-40 items-center justify-center text-sm font-medium text-blue-700 hover:underline">
              📄 Open proof ({att.filename})
            </a>
          )
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-neutral-400">No file attached — contact us for the proof.</div>
        )}
      </div>

      {decided ? (
        <div className={`rounded-xl p-5 ${s?.cls ?? "bg-neutral-100 text-neutral-700"}`}>
          <div className="text-sm font-semibold">{s?.label ?? proof.status}</div>
          <div className="mt-1 text-sm">
            Signed by {proof.signedName ?? "—"}
            {proof.respondedAt ? ` on ${DateTime.fromJSDate(proof.respondedAt).setZone(TZ).toFormat("LLL d, yyyy 'at' h:mm a")} MT` : ""}
          </div>
          {proof.responseNotes && <div className="mt-2 whitespace-pre-wrap text-sm">“{proof.responseNotes}”</div>}
        </div>
      ) : (
        <ProofDecisionForm token={token} />
      )}
    </div>,
  );
}
