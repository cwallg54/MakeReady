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
