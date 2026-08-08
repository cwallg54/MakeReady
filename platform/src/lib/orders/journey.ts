import type { OrderStage } from "./stages";

// The lead-to-cash journey for a single order, derived from real state. Shown as
// a persistent strip on every page that touches the order so anyone can see, at
// a glance, where it is from quote to paid.

export type JourneyState = "done" | "current" | "todo" | "na";
export interface JourneyStep { n: number; key: string; label: string; state: JourneyState }

export interface JourneyInput {
  hasQuote: boolean;
  stage: OrderStage;
  artApproved: boolean;
  productionReady: boolean;
  hasInvoice: boolean;
  paid: boolean;
}

const STEPS = [
  { key: "quote", label: "Quote" },
  { key: "order", label: "Order placed" },
  { key: "art", label: "Art & proof" },
  { key: "production", label: "Production" },
  { key: "delivered", label: "Delivered" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
];

export function computeOrderJourney(i: JourneyInput): JourneyStep[] {
  const inStage = (s: OrderStage[]) => s.includes(i.stage);
  const done: Record<string, boolean | "na"> = {
    quote: i.hasQuote ? true : "na",
    order: true,
    art: i.artApproved || i.productionReady || inStage(["production", "quality", "shipped", "delivered"]),
    production: i.productionReady || inStage(["quality", "shipped", "delivered"]),
    delivered: i.stage === "delivered",
    invoiced: i.hasInvoice,
    paid: i.paid,
  };
  let currentTaken = false;
  return STEPS.map((s, idx) => {
    const d = done[s.key];
    if (d === "na") return { n: idx + 1, key: s.key, label: s.label, state: "na" };
    if (d) return { n: idx + 1, key: s.key, label: s.label, state: "done" };
    if (!currentTaken) { currentTaken = true; return { n: idx + 1, key: s.key, label: s.label, state: "current" }; }
    return { n: idx + 1, key: s.key, label: s.label, state: "todo" };
  });
}
