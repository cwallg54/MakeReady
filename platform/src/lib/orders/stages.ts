/** Order production stages, in order, with customer-facing labels/descriptions. */
export type OrderStage = "received" | "art_proof" | "production" | "quality" | "shipped" | "delivered";

export const ORDER_STAGES: { key: OrderStage; label: string; customer: string; icon: string }[] = [
  { key: "received", label: "Order Received", customer: "We've received your order", icon: "📥" },
  { key: "art_proof", label: "Art & Proof", customer: "Your art is being prepared & proofed", icon: "🎨" },
  { key: "production", label: "In Production", customer: "Your order is being produced", icon: "🖨️" },
  { key: "quality", label: "Quality Check", customer: "We're checking quality", icon: "🔍" },
  { key: "shipped", label: "Shipped", customer: "Your order is on its way", icon: "🚚" },
  { key: "delivered", label: "Delivered", customer: "Delivered — thank you!", icon: "✅" },
];

export function stageIndex(stage: OrderStage): number {
  return ORDER_STAGES.findIndex((s) => s.key === stage);
}
