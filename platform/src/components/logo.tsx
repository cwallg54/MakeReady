/**
 * MakeReady by G54 brand logo — two overlapping mountain peaks (a dark peak +
 * two lime bars) with the "MakeReady" wordmark.
 *
 * The lime green is fixed brand color; the dark parts use `currentColor` so the
 * lockup reads correctly on both light surfaces (public pages, mobile header —
 * dark on white) and the dark sidebar / auth screens (white on near-black).
 */
const GREEN = "#8DC63F";

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 80" className={className} fill="none" aria-hidden="true">
      {/* Left peak — adapts to the background. */}
      <path
        d="M6 73 L48 13 L90 73"
        stroke="currentColor"
        strokeWidth={13}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Right peak — two parallel lime bars. */}
      <path d="M78 73 L108 30" stroke={GREEN} strokeWidth={13} strokeLinecap="round" />
      <path d="M100 73 L130 30" stroke={GREEN} strokeWidth={13} strokeLinecap="round" />
    </svg>
  );
}

/** Full stacked lockup: mark over the wordmark + "BY G54" rule. */
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
    <div className={`flex flex-col items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <div className="text-center leading-none">
        <div className="text-2xl font-extrabold tracking-tight">
          <span className="text-[#8DC63F]">Make</span>
          <span>Ready</span>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="h-px w-6 bg-[#8DC63F]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
            by <span className="font-black">G54</span>
          </span>
          <span className="h-px w-6 bg-[#8DC63F]" />
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
      <LogoMark className="h-7 w-auto shrink-0" />
      <span className="text-base font-extrabold tracking-tight">
        <span className="text-[#8DC63F]">Make</span>
        <span>Ready</span>
      </span>
    </div>
  );
}
