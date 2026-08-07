import Link from "next/link";

// The Art Department SOP as an explicit, numbered flow. Each step is derived
// from the request's real state so the artist/sales can see at a glance where
// the job is and — the important part — exactly what to do next.

export type StepState = "done" | "current" | "todo" | "na";

export interface WorkflowStep {
  n: number;
  label: string;
  state: StepState;
  /** Shown in the "next step" callout when this is the current step. */
  hint?: string;
  /** Anchor id of the card on the page this step maps to. */
  anchor?: string;
}

const DOT: Record<StepState, string> = {
  done: "bg-emerald-500 text-white border-emerald-500",
  current: "bg-brand text-white border-brand ring-4 ring-brand/15",
  todo: "bg-white text-neutral-400 border-neutral-300",
  na: "bg-neutral-100 text-neutral-300 border-neutral-200",
};
const LABEL: Record<StepState, string> = {
  done: "text-neutral-700",
  current: "text-neutral-900 font-semibold",
  todo: "text-neutral-400",
  na: "text-neutral-300",
};

export function ArtWorkflow({ steps }: { steps: WorkflowStep[] }) {
  const current = steps.find((s) => s.state === "current");
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Workflow</h2>
        <span className="text-xs text-neutral-400">Art Department SOP</span>
      </div>
      <ol className="flex flex-wrap items-start gap-x-1 gap-y-3">
        {steps.map((s, i) => {
          const body = (
            <div className="flex w-[6.5rem] flex-col items-center text-center">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${DOT[s.state]}`}>
                {s.state === "done" ? "✓" : s.state === "na" ? "–" : s.n}
              </span>
              <span className={`mt-1 text-[11px] leading-tight ${LABEL[s.state]}`}>{s.label}</span>
            </div>
          );
          return (
            <li key={s.n} className="flex items-start">
              {s.anchor && s.state !== "na" ? <a href={`#${s.anchor}`}>{body}</a> : body}
              {i < steps.length - 1 && <span className="mt-3.5 h-px w-3 bg-neutral-200" />}
            </li>
          );
        })}
      </ol>
      {current && current.hint && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
          <span className="font-semibold text-brand-ink">Next:</span>
          <span className="text-neutral-700">
            {current.anchor ? <Link href={`#${current.anchor}`} className="text-brand-ink underline-offset-2 hover:underline">{current.hint}</Link> : current.hint}
          </span>
        </div>
      )}
    </div>
  );
}
