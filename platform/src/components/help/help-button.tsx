"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { helpSlugForPath } from "@/lib/help/route-map";

// A contextual "?" in the top bar. Deep-links to the article for the current
// page, or the Help Center home when there's no specific match.
export function HelpButton() {
  const pathname = usePathname();
  const slug = pathname?.startsWith("/help") ? null : helpSlugForPath(pathname ?? "");
  const href = slug ? `/help/${slug}` : "/help";
  return (
    <Link
      href={href}
      title="Help for this page"
      aria-label="Help for this page"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
    >
      ?
    </Link>
  );
}
