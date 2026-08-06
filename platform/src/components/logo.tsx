/* eslint-disable @next/next/no-img-element */
/**
 * MakeReady by G54 brand logo — the supplied brand artwork
 * (public/makeready-logo.png), background knocked out to transparent. The
 * artwork is black, so pass `dark` on dark surfaces (auth screens) to render it
 * white via CSS. On light surfaces (sidebar strip, public pages) it shows black.
 */

const DARK = "brightness-0 invert"; // black artwork → white for dark backgrounds

export function LogoMark({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return <img src="/makeready-logo.png" alt="MakeReady by G54" className={`${className} ${dark ? DARK : ""}`} />;
}

/** Full stacked lockup for public pages and the auth screens. */
export function Logo({
  className = "",
  markClassName = "h-20 w-auto",
  showTagline = false,
  dark = false,
}: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
  dark?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img src="/makeready-logo.png" alt="MakeReady by G54" className={`${markClassName} ${dark ? DARK : ""}`} />
      {showTagline && (
        <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.3em] opacity-50">
          Plan. Process. Produce.
        </div>
      )}
    </div>
  );
}

/** Compact lockup for the app sidebar / mobile header. */
export function LogoInline({
  className = "",
  imgClassName = "h-11 w-auto",
  dark = false,
}: {
  className?: string;
  imgClassName?: string;
  dark?: boolean;
}) {
  return <img src="/makeready-logo.png" alt="MakeReady by G54" className={`${imgClassName} ${className} ${dark ? DARK : ""}`} />;
}
