// Renders a captioned screenshot for help articles. Screenshots live in
// /public/help/<src>. If a screenshot is missing, a neutral placeholder shows
// so the article still reads cleanly.

export function HelpImage({ src, caption }: { src: string; caption?: string }) {
  return (
    <figure className="my-4 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/help/${src}`}
        alt={caption ?? "Screenshot"}
        className="block w-full"
        loading="lazy"
      />
      {caption && <figcaption className="border-t border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-500">{caption}</figcaption>}
    </figure>
  );
}
