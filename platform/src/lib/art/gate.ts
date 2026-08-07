import type { Order, OrderSpecItem, OrderAttachment } from "@/db/schema";

/** The art-request readiness checklist. An order can't be handed to the art
 *  department until every item is satisfied — so art never has to chase sales
 *  for missing placement, colors, sizes, or artwork. Derived from data already
 *  captured on the order (production spec + attachments), so filling those in
 *  auto-checks the boxes; the artwork item requires a real uploaded file. */
export interface ArtChecklistItem {
  key: string;
  label: string;
  done: boolean;
  hint: string;
}

const ART_KINDS = new Set(["art", "mockup", "reference"]);
const filled = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

export function artReadinessChecklist(
  order: Pick<Order, "productionNotes">,
  specItems: OrderSpecItem[],
  attachments: Pick<OrderAttachment, "kind">[],
): { items: ArtChecklistItem[]; complete: boolean } {
  const items: ArtChecklistItem[] = [
    {
      key: "item",
      label: "Item & decoration method",
      done: specItems.some((s) => filled(s.product) && filled(s.decorationMethod)),
      hint: "Add an item with its decoration method in Production details.",
    },
    {
      key: "placement",
      label: "Placement / location",
      done: specItems.some((s) => filled(s.placement)),
      hint: "Where the decoration goes — left chest, full back, wrap…",
    },
    {
      key: "colors",
      label: "Imprint colors",
      done: specItems.some((s) => filled(s.colors) || (s.colorCount ?? 0) > 0),
      hint: "Ink / thread colors, or the number of colors.",
    },
    {
      key: "sizes",
      label: "Sizes / quantities",
      done: specItems.some((s) => filled(s.sizeBreakdown)),
      hint: "Size & quantity breakdown (enter N/A if it doesn't apply).",
    },
    {
      key: "artwork",
      label: "Artwork or reference attached",
      done: attachments.some((a) => ART_KINDS.has(a.kind)),
      hint: "Upload the customer art, a mockup, or a reference/sketch under Attachments — evidence is required.",
    },
    {
      key: "brief",
      label: "Design brief / instructions",
      done: filled(order.productionNotes),
      hint: "Describe what the customer wants in Production details → Special instructions.",
    },
  ];
  return { items, complete: items.every((i) => i.done) };
}

// ---- Production Readiness Checklist (art → production) ---------------------
export interface ProdReadyItem { key: string; label: string; done: boolean; na?: boolean }

export interface ProdReadyInput {
  productionType: string | null;
  stitchCount: number | null;
  separationsDone: boolean;
  buyerSentAt: Date | null;
  estimatedMinutes: number | null;
  blankItemRef: string | null;
  designActive: boolean;
  hasApprovedProof: boolean;
  hasPendingProof: boolean;
  hasArtwork: boolean;
  hasSpec: boolean;
  specHasDecoration: boolean;
  hasSpecialInstructions: boolean;
}

/** The SOP's production-readiness checklist. Type-specific items (stitch count,
 *  separations, buyer) are N/A unless the production type applies; N/A items
 *  don't block completeness. */
export function productionReadinessChecklist(i: ProdReadyInput): { items: ProdReadyItem[]; complete: boolean } {
  const t = i.productionType;
  const items: ProdReadyItem[] = [
    { key: "approved", label: "Customer artwork approved", done: i.hasApprovedProof },
    { key: "no_revisions", label: "No outstanding revisions", done: !i.hasPendingProof },
    { key: "item", label: "Garment / headwear / hard goods selected", done: !!i.blankItemRef || i.hasSpec },
    { key: "decoration", label: "Decoration method confirmed", done: !!t || i.specHasDecoration },
    { key: "artwork", label: "Working art file linked", done: i.hasArtwork || i.designActive },
    { key: "orderable", label: "Orderable design punched in (item # + barcode)", done: i.designActive },
    { key: "stitch", label: "Stitch count recorded (embroidery)", done: t === "embroidery" ? (i.stitchCount ?? 0) > 0 : true, na: t !== "embroidery" },
    { key: "seps", label: "Separations completed (silkscreen)", done: t === "screen_print" ? i.separationsDone : true, na: t !== "screen_print" },
    { key: "buyer", label: "Buyer notified (headwear / hard goods)", done: t === "headwear" || t === "hard_goods" ? !!i.buyerSentAt : true, na: !(t === "headwear" || t === "hard_goods") },
    { key: "instructions", label: "Special instructions documented", done: i.hasSpecialInstructions },
    { key: "estimate", label: "Estimated production time confirmed", done: (i.estimatedMinutes ?? 0) > 0 },
  ];
  return { items, complete: items.every((it) => it.done) };
}

