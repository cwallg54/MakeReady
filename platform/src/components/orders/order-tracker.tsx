import { ORDER_STAGES, stageIndex, type OrderStage } from "@/lib/orders/stages";

/** Domino's-style horizontal progress tracker. Pure display; used on staff + public pages. */
export function OrderTracker({
  currentStage,
  reachedAt,
  variant = "app",
}: {
  currentStage: OrderStage;
  reachedAt?: Partial<Record<OrderStage, string>>;
  variant?: "app" | "customer";
}) {
  const curIdx = stageIndex(currentStage);
  const done = (i: number) => i < curIdx;
  const active = (i: number) => i === curIdx;

  return (
    <div className="w-full">
      <div className="flex items-start">
        {ORDER_STAGES.map((s, i) => (
          <div key={s.key} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <div className={`h-1 flex-1 ${i === 0 ? "bg-transparent" : done(i) || active(i) ? "bg-emerald-500" : "bg-neutral-200"}`} />
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg transition ${
                  done(i)
                    ? "bg-emerald-500 text-white"
                    : active(i)
                      ? "bg-neutral-900 text-white ring-4 ring-neutral-900/15"
                      : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {done(i) ? "✓" : s.icon}
              </div>
              <div className={`h-1 flex-1 ${i === ORDER_STAGES.length - 1 ? "bg-transparent" : done(i) ? "bg-emerald-500" : "bg-neutral-200"}`} />
            </div>
            <div className="mt-2 px-1">
              <p className={`text-xs font-semibold ${active(i) ? "text-neutral-900" : done(i) ? "text-emerald-700" : "text-neutral-400"}`}>
                {variant === "customer" ? s.label : s.label}
              </p>
              {reachedAt?.[s.key] && <p className="mt-0.5 text-[10px] text-neutral-400">{reachedAt[s.key]}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
