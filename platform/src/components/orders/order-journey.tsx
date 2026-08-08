import { CopyLink } from "./copy-link";
import type { JourneyStep } from "@/lib/orders/journey";

const DOT: Record<string, string> = {
  done: "bg-emerald-500 text-white border-emerald-500",
  current: "bg-brand text-white border-brand ring-4 ring-brand/15",
  todo: "bg-white text-neutral-400 border-neutral-300",
  na: "bg-neutral-100 text-neutral-300 border-neutral-200",
};
const LABEL: Record<string, string> = {
  done: "text-neutral-700",
  current: "text-neutral-900 font-semibold",
  todo: "text-neutral-400",
  na: "text-neutral-300",
};

/** The lead-to-cash journey strip + the one customer link that follows the
 *  order the whole way. Rendered on every page that touches the order. */
export function OrderJourney({ steps, orderNumber, trackUrl }: { steps: JourneyStep[]; orderNumber: string; trackUrl?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Order journey</h2>
        <span className="text-xs text-neutral-400">{orderNumber}</span>
      </div>
      <ol className="flex flex-wrap items-start gap-x-1 gap-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start">
            <div className="flex w-[5.5rem] flex-col items-center text-center">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${DOT[s.state]}`}>
                {s.state === "done" ? "✓" : s.state === "na" ? "–" : s.n}
              </span>
              <span className={`mt-1 text-[11px] leading-tight ${LABEL[s.state]}`}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <span className="mt-3.5 h-px w-3 bg-neutral-200" />}
          </li>
        ))}
      </ol>
      {trackUrl && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <p className="mb-1 text-[11px] font-medium text-neutral-500">Customer link — one link that follows this order the whole journey</p>
          <CopyLink url={trackUrl} />
        </div>
      )}
    </div>
  );
}
