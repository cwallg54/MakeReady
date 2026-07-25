import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { quotes, quoteLines, quoteCharges, orderFormTemplates, templateItems, businessPartners } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { setQuoteStatusAction } from "@/lib/sales/actions";
import type { ChargeRule } from "@/lib/sales/pricing";
import { QuoteBuilder } from "./quote-builder";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-200 text-neutral-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  converted: "bg-purple-100 text-purple-700",
};
const NEXT_STATUS: Record<string, { to: string; label: string }[]> = {
  draft: [{ to: "sent", label: "Mark sent" }],
  sent: [{ to: "accepted", label: "Accepted" }, { to: "rejected", label: "Rejected" }],
  accepted: [{ to: "converted", label: "Convert to order" }],
  rejected: [{ to: "draft", label: "Reopen" }],
  converted: [],
};

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("sales");
  const { id } = await params;
  const editable = canEdit(user.roles, "sales");

  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!quote) notFound();

  const [template, lines, charges, bp] = await Promise.all([
    quote.templateId ? db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.id, quote.templateId) }) : Promise.resolve(undefined),
    db.select().from(quoteLines).where(eq(quoteLines.quoteId, id)).orderBy(asc(quoteLines.sortOrder)),
    db.select().from(quoteCharges).where(eq(quoteCharges.quoteId, id)),
    quote.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, quote.bpId) }) : Promise.resolve(undefined),
  ]);
  const catalog = template
    ? await db.select().from(templateItems).where(eq(templateItems.templateId, template.id)).orderBy(asc(templateItems.sortOrder))
    : [];

  const rules = (template?.charges as ChargeRule[] | null) ?? [];
  const canStatus = editable && quote.status !== "converted";

  return (
    <div className="max-w-5xl">
      <Link href="/sales" className="text-sm text-neutral-500 hover:text-neutral-900">← Quotes</Link>
      <PageHeader
        title={quote.quoteNumber}
        description={`${template?.name ?? "No template"}${bp ? ` · ${bp.companyName}` : ""}`}
        action={
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[quote.status]}`}>{quote.status}</span>
            {canStatus && (NEXT_STATUS[quote.status] ?? []).map((n) => (
              <form key={n.to} action={setQuoteStatusAction}>
                <input type="hidden" name="id" value={quote.id} />
                <input type="hidden" name="status" value={n.to} />
                <button className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">{n.label}</button>
              </form>
            ))}
          </div>
        }
      />

      <QuoteBuilder
        quoteId={quote.id}
        editable={editable && quote.status !== "converted"}
        catalog={catalog.map((c) => ({ code: c.code, name: c.name, unitPrice: Number(c.unitPrice) }))}
        rules={rules}
        initialLines={lines.map((l) => ({ itemCode: l.itemCode ?? undefined, description: l.description, qty: l.qty, unitPrice: Number(l.unitPrice) }))}
        initialApplied={charges.map((c) => ({ key: c.key, inputQty: Number(c.inputQty) }))}
        initialReorder={quote.isReorder}
        initialDiscount={Number(quote.discount)}
        initialNotes={quote.notes ?? ""}
      />
    </div>
  );
}
