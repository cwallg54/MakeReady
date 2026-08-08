export const CARRIERS = ["UPS", "FedEx", "USPS", "DHL", "Other"] as const;
export type Carrier = (typeof CARRIERS)[number];

/** Build a public "track your package" URL for a carrier + tracking number. */
export function carrierTrackingUrl(carrier: string | null | undefined, tracking: string | null | undefined): string | null {
  if (!carrier || !tracking) return null;
  const t = encodeURIComponent(tracking.trim());
  switch (carrier) {
    case "UPS": return `https://www.ups.com/track?tracknum=${t}`;
    case "FedEx": return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
    case "USPS": return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`;
    case "DHL": return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${t}`;
    default: return null;
  }
}
