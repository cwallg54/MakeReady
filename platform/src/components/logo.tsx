/* eslint-disable @next/next/no-img-element */
/**
 * MakeReady by G54 brand logo — the supplied brand artwork
 * (public/makeready-logo.png), background knocked out to transparent so it sits
 * cleanly on both light surfaces (public pages, mobile header) and the dark
 * sidebar / auth screens. The artwork itself is unmodified.
 */

export function LogoMark({ className = "" }: { className?: string }) {
  return <img src="/makeready-logo.png" alt="MakeReady by G54" className={className} />;
}

/** Full stacked lockup for public pages and the auth screens. */
export function Logo({
  className = "",
  markClassName = "h-14 w-auto",
  showTagline = false,
}: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img src="/makeready-logo.png" alt="MakeReady by G54" className={markClassName} />
      {showTagline && (
        <div className="mt-3 text-[9px] font-medium uppercase tracking-[0.3em] opacity-50">
          Plan. Process. Produce.
        </div>
      )}
    </div>
  );
}

/** Compact lockup for the app sidebar / mobile header. */
export function LogoInline({ className = "" }: { className?: string }) {
  return <img src="/makeready-logo.png" alt="MakeReady by G54" className={`h-9 w-auto ${className}`} />;
}
