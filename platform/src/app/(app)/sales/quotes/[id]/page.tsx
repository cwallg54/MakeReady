import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { db } from "@/db";
import { quotes, quoteLines, quoteCharges, quoteAttachments, orderFormTemplates, businessPartners, contacts, catalogStyles, catalogColors, sizeClasses, decorationMethods, printLocations, embroideryTiers, creditApprovalRequests } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BpSearchSelect } from "@/components/crm/bp-search-select";
import { setQuoteStatusAction, setQuoteCustomerAction, deleteQuoteAction } from "@/lib/sales/actions";
import { emailQuoteToCustomerAction } from "@/lib/sales/quote-approval-actions";
import { fmtDateTime } from "@/lib/format";
import { uploadQuoteAttachmentsAction, removeQuoteAttachmentAction } from "@/lib/sales/attachment-actions";
import type { ChargeRule, GarmentLineData, DecorationInput, MethodRef, SizeEntry } from "@/lib/sales/pricing";
import type { CatalogRefs } from "./garment-lines";
import { QuoteBuilder } from "./quote-builder";
import { pricingMethods, pricingGarments } from "@/db/schema";
import { inArray } from "drizzle-orm";
import type { SilkscreenConfig, EmbroideryConfig, AsiConfig } from "@/lib/pricing/engine";
import { listExtras, listFreight, listRoyalties } from "@/lib/pricing/service";
import { PriceCalculator } from "@/app/(app)/admin/pricing/price-calculator";

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

export default async function QuoteDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ review?: string }> }) {
  const user = await requireModule("sales");
  const { id } = await params;
  const { review } = await searchParams;
  const editable = canEdit(user.roles, "sales");

  const quote = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!quote) notFound();

  const [template, lines, charges, bp, attachments] = await Promise.all([
    quote.templateId ? db.query.orderFormTemplates.findFirst({ where: eq(orderFormTemplates.id, quote.templateId) }) : Promise.resolve(undefined),
    db.select().from(quoteLines).where(eq(quoteLines.quoteId, id)).orderBy(asc(quoteLines.sortOrder)),
    db.select().from(quoteCharges).where(eq(quoteCharges.quoteId, id)),
    quote.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, quote.bpId) }) : Promise.resolve(undefined),
    db.select().from(quoteAttachments).where(eq(quoteAttachments.quoteId, id)).orderBy(asc(quoteAttachments.createdAt)),
  ]);

  // Full quoting-calculator reference data (blank catalog + decoration config).
  const [styleRows, colorRows, classRows, methodRows, locationRows, embRows] = await Promise.all([
    db.select().from(catalogStyles).where(eq(catalogStyles.active, true)).orderBy(asc(catalogStyles.sortOrder), asc(catalogStyles.name)),
    db.select().from(catalogColors).where(eq(catalogColors.active, true)).orderBy(asc(catalogColors.sortOrder)),
    db.select().from(sizeClasses).orderBy(asc(sizeClasses.sortOrder)),
    db.select().from(decorationMethods).where(eq(decorationMethods.active, true)).orderBy(asc(decorationMethods.sortOrder)),
    db.select().from(printLocations).where(eq(printLocations.active, true)).orderBy(asc(printLocations.sortOrder)),
    db.select().from(embroideryTiers).where(eq(embroideryTiers.active, true)).orderBy(asc(embroideryTiers.sortOrder)),
  ]);
  const colorsByStyle = new Map<string, { name: string; tierCode: string | null; hex: string | null }[]>();
  for (const c of colorRows) {
    const arr = colorsByStyle.get(c.styleId) ?? [];
    arr.push({ name: c.name, tierCode: c.tierCode, hex: c.hex });
    colorsByStyle.set(c.styleId, arr);
  }
  // Softgoods engine config + per-style garment cost (supplier cost, else the
  // seeded pricing_garments cost by style number) so silkscreen lines price via
  // Kim's spreadsheet math.
  const [ssMethod, embMethod, asiMethod] = await Promise.all([
    db.query.pricingMethods.findFirst({ where: eq(pricingMethods.key, "silkscreen") }),
    db.query.pricingMethods.findFirst({ where: eq(pricingMethods.key, "embroidery") }),
    db.query.pricingMethods.findFirst({ where: eq(pricingMethods.key, "asi") }),
  ]);
  const engineExtras = await listExtras();
  const appSettings = await db.query.systemSettings.findFirst({ columns: { repDiscountCapPct: true } });
  const styleNums = styleRows.map((s) => s.styleNumber).filter((x): x is string => !!x);
  const pgRows = styleNums.length ? await db.select({ garmentNumber: pricingGarments.garmentNumber, cost: pricingGarments.cost }).from(pricingGarments).where(inArray(pricingGarments.garmentNumber, styleNums)) : [];
  const costByNum = new Map(pgRows.map((r) => [r.garmentNumber, Number(r.cost)]));
  const garmentCostByStyleId: Record<string, number> = {};
  for (const s of styleRows) {
    const c = s.supplierCost != null ? Number(s.supplierCost) : s.styleNumber ? costByNum.get(s.styleNumber) : undefined;
    if (c != null && c > 0) garmentCostByStyleId[s.id] = c;
  }

  const catalogRefs: CatalogRefs = {
    styles: styleRows.map((s) => ({ id: s.id, name: s.name, brand: s.brand, styleNumber: s.styleNumber, basePrice: Number(s.basePrice), sizeClassCode: s.sizeClassCode, colors: colorsByStyle.get(s.id) ?? [] })),
    sizeClassByCode: Object.fromEntries(classRows.map((c) => [c.code, (c.sizes as SizeEntry[] | null) ?? []])),
    methods: methodRows.map((m) => ({ code: m.code, name: m.name, priceMode: m.priceMode, pricing: (m.pricing as MethodRef["pricing"]) ?? null })),
    locations: locationRows.map((l) => ({ code: l.code, name: l.name })),
    embTiers: embRows.map((e) => ({ code: e.code, name: e.name, pricePerUnit: Number(e.pricePerUnit) })),
    engine: (ssMethod || embMethod || asiMethod)
      ? { silkscreen: ssMethod?.config as SilkscreenConfig | undefined, embroidery: embMethod?.config as EmbroideryConfig | undefined, asi: asiMethod?.config as AsiConfig | undefined }
      : undefined,
    garmentCostByStyleId,
    extras: engineExtras.map((e) => ({ id: e.id, label: e.label, amount: e.amount == null ? null : Number(e.amount), kind: e.kind })),
  };

  // Split saved lines: garment lines carry a styleId or decorations; the rest are simple.
  const isGarment = (l: typeof lines[number]) => !!l.styleId || (Array.isArray(l.decorations) && (l.decorations as unknown[]).length > 0) || (l.sizeBreakdown != null && Object.keys(l.sizeBreakdown as object).length > 0);
  const garmentLineData: GarmentLineData[] = lines.filter(isGarment).map((l) => ({
    styleId: l.styleId,
    description: l.description,
    color: l.color,
    colorTier: l.colorTier,
    sizeBreakdown: (l.sizeBreakdown as Record<string, number> | null) ?? {},
    decorations: (l.decorations as DecorationInput[] | null) ?? [],
    extras: (l.extras as string[] | null) ?? [],
  }));

  // Recipient for the mailto: primary contact email, else the BP's email.
  const primaryContact = quote.bpId
    ? await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, quote.bpId), eq(contacts.isPrimary, true)) })
    : undefined;
  const toEmail = primaryContact?.email ?? bp?.email ?? "";
  const rules = (template?.charges as ChargeRule[] | null) ?? [];
  const canStatus = editable && quote.status !== "converted";
  const base = process.env.APP_URL ?? "https://makeready.g54.com";
  // A pending finance credit review parks the conversion (reps never see the numbers).
  const pendingCredit = await db.query.creditApprovalRequests.findFirst({ where: and(eq(creditApprovalRequests.quoteId, id), eq(creditApprovalRequests.status, "pending")), columns: { id: true } });

  // Softgoods pricing engine refs (Kim's spreadsheet math, live) for the price-check tool.
  const [pMethods, pExtras, pFreight, pRoyalties] = await Promise.all([
    db.select().from(pricingMethods).orderBy(asc(pricingMethods.label)),
    listExtras(),
    listFreight(),
    listRoyalties(),
  ]);

  return (
    <div className="max-w-5xl">
      <Link href="/sales" className="text-sm text-neutral-500 hover:text-neutral-900">← Quotes</Link>
      <PageHeader
        title={quote.quoteNumber}
        description={`${template?.name ?? "No template"}${bp ? ` · ${bp.companyName}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {editable && quote.status !== "converted" && (
              <form action={emailQuoteToCustomerAction} title={toEmail ? `Email an approve/decline link to ${toEmail}` : "No email on file for this customer"}>
                <input type="hidden" name="id" value={quote.id} />
                <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700">✉ Email for approval</button>
              </form>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[quote.status]}`}>{quote.status}</span>
            {canStatus && (NEXT_STATUS[quote.status] ?? []).map((n) => (
              <form key={n.to} action={setQuoteStatusAction}>
                <input type="hidden" name="id" value={quote.id} />
                <input type="hidden" name="status" value={n.to} />
                <button className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">{n.label}</button>
              </form>
            ))}
            {editable && quote.status === "draft" && (
              <form action={deleteQuoteAction}>
                <input type="hidden" name="id" value={quote.id} />
                <ConfirmButton message="Delete this draft quote? This cannot be undone." className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Delete draft</ConfirmButton>
              </form>
            )}
          </div>
        }
      />

      {(review || pendingCredit) && quote.status !== "converted" && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Submitted for credit review.</span> This order needs finance sign-off before it can be produced. Your finance team has been notified and will approve or follow up — no action needed from you.
        </div>
      )}

      {/* Customer approval — the public link and the customer's response. */}
      <Card className="mb-6">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Customer approval</h2>
        {quote.respondedAt ? (
          <p className="text-sm">
            <span className={`font-semibold ${quote.status === "rejected" ? "text-red-700" : "text-emerald-700"}`}>{quote.status === "rejected" ? "Declined" : "Approved"}</span>
            {" "}by {quote.signedName} · {fmtDateTime(quote.respondedAt)}
            {quote.responseNote && <span className="mt-1 block whitespace-pre-wrap text-neutral-600">“{quote.responseNote}”</span>}
          </p>
        ) : quote.publicToken ? (
          <>
            <p className="mb-2 text-xs text-neutral-500">Send the customer this link (or use “Email for approval”) to approve or decline online.</p>
            <input readOnly value={`${base}/quote/${quote.publicToken}`} className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-xs text-neutral-700 outline-none" />
          </>
        ) : (
          <p className="text-sm text-neutral-500">Click <strong>Email for approval</strong> above to send the customer a link to approve or decline this quote online.</p>
        )}
      </Card>

      {editable && quote.status !== "converted" && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
          <form action={setQuoteCustomerAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={quote.id} />
            <label className="flex flex-col text-xs text-neutral-500">
              Customer (Business Partner)
              <div className="mt-1 min-w-72">
                <BpSearchSelect name="bpId" defaultId={quote.bpId ?? ""} defaultLabel={bp?.companyName ?? ""} />
              </div>
            </label>
            <button className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Save customer</button>
          </form>
        </div>
      )}

      <QuoteBuilder
        quoteId={quote.id}
        editable={editable && quote.status !== "converted"}
        rules={rules}
        catalogRefs={catalogRefs}
        initialGarmentLines={garmentLineData}
        initialApplied={charges.filter((c) => !c.key.startsWith("deco-")).map((c) => ({ key: c.key, inputQty: Number(c.inputQty) }))}
        initialReorder={quote.isReorder}
        initialAsi={quote.isAsi}
        initialDiscount={Number(quote.discount)}
        initialNotes={quote.notes ?? ""}
        canDiscount={user.roles.some((r) => r === "admin" || r === "sales_manager")}
        repDiscountCapPct={Number(appSettings?.repDiscountCapPct ?? 0)}
      />

      {pMethods.length > 0 && (
        <Card className="mt-6">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-neutral-900">Softgoods price check <span className="font-normal text-neutral-500">— exact silkscreen / embroidery pricing from the calculator engine</span></summary>
            <p className="mb-3 mt-2 text-xs text-neutral-500">Enter a garment #, quantity, print level and options to get the precise per-piece price (garment cost × qty-band multiplier + screen charges + extras + freight + royalty), then key it into the line above. Costs are managed in Admin → Softgoods Pricing.</p>
            <PriceCalculator
              methods={pMethods.map((mm) => ({ key: mm.key, label: mm.label }))}
              extras={pExtras.map((e) => ({ id: e.id, label: e.label, amount: e.amount, kind: e.kind }))}
              royalties={pRoyalties.map((r) => ({ name: r.name, pct: r.pct }))}
              freight={pFreight.map((f) => ({ vendor: f.vendor }))}
            />
          </details>
        </Card>
      )}

      {/* Customer intake files — carried onto the order for the art department. */}
      <Card className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Customer artwork &amp; reference images</h2>
        <p className="mb-3 text-xs text-neutral-500">Upload what the customer provided during intake (logos, art, reference photos). These travel to the order and the art department when this quote is converted.</p>
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-3">
            {attachments.map((a) => (
              <div key={a.id} className="w-28">
                <a href={`/sales/quotes/${quote.id}/attachment/${a.id}`} target="_blank" rel="noreferrer" className="group block" title="Open / download">
                  {a.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/sales/quotes/${quote.id}/attachment/${a.id}`} alt={a.filename} className="h-28 w-28 rounded-lg border border-neutral-200 object-cover group-hover:ring-2 group-hover:ring-neutral-400" />
                  ) : (
                    <div className="flex h-28 w-28 flex-col items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-center group-hover:ring-2 group-hover:ring-neutral-400">
                      <span className="text-2xl">📄</span>
                      <span className="mt-1 line-clamp-2 text-[10px] text-neutral-500">{a.filename}</span>
                    </div>
                  )}
                </a>
                <div className="mt-1 flex items-center justify-between">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] capitalize text-neutral-500">{a.kind}</span>
                  {editable && quote.status !== "converted" && (
                    <form action={removeQuoteAttachmentAction}>
                      <input type="hidden" name="quoteId" value={quote.id} />
                      <input type="hidden" name="attachmentId" value={a.id} />
                      <button className="text-[11px] text-red-600 hover:text-red-800">remove</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {editable && quote.status !== "converted" && (
          <form action={uploadQuoteAttachmentsAction} className="flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
            <input type="hidden" name="quoteId" value={quote.id} />
            <select name="kind" className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-800">
              <option value="art">Customer art</option>
              <option value="reference">Reference</option>
              <option value="mockup">Mockup</option>
              <option value="other">Other</option>
            </select>
            <input type="file" name="files" multiple accept="image/*,.pdf,.ai,.eps,.psd" className="text-sm text-neutral-600 file:mr-2 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white" />
            <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Upload</button>
          </form>
        )}
      </Card>
    </div>
  );
}
