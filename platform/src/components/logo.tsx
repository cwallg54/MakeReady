/**
 * MakeReady logo — geometric triple-peak mark + wordmark.
 * A placeholder rendering of the brand mark lives at /public/makeready-mark.svg;
 * drop the final brand PNG/SVG there (or swap this component) for pixel-perfect art.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 66" className={className} fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth={9}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M6 60 L46 10 L86 60" />
        <path d="M64 60 L96 20 L128 60" />
        <path d="M104 60 L126 32 L146 60" />
      </g>
    </svg>
  );
}

export function Logo({
  className = "",
  markClassName = "h-7 w-auto",
  showTagline = false,
}: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <LogoMark className={markClassName} />
      <div className="text-center leading-none">
        <div className="text-xl font-extrabold tracking-tight">
          MAKE<span className="font-black">READY</span>
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] opacity-70">
          by G54
        </div>
        {showTagline && (
          <div className="mt-2 text-[9px] font-medium uppercase tracking-[0.3em] opacity-50">
            Plan. Process. Produce.
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact horizontal lockup for the app sidebar/header. */
export function LogoInline({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className="h-6 w-auto shrink-0" />
      <span className="text-sm font-extrabold tracking-tight">
        MAKE<span className="font-black">READY</span>
      </span>
    </div>
  );
}
