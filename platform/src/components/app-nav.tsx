"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  key: string;
  label: string;
  href?: string;
  phase1: boolean;
  children?: NavItem[];
}

function isMatch(href: string, path: string) {
  return path === href || path.startsWith(href + "/");
}

/** Longest matching leaf href wins (so /sales/orders beats /sales). */
function computeActiveHref(items: NavItem[], path: string): string | null {
  const leaves: string[] = [];
  const walk = (list: NavItem[]) => list.forEach((i) => (i.children ? walk(i.children) : i.href && leaves.push(i.href)));
  walk(items);
  let best: string | null = null;
  for (const h of leaves) if (isMatch(h, path) && (!best || h.length > best.length)) best = h;
  return best;
}

function Leaf({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href!}
      onClick={onNavigate}
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition ${
        active
          ? "bg-[#8DC63F]/15 font-semibold text-[#a6e05a] ring-1 ring-inset ring-[#8DC63F]/30"
          : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
      }`}
    >
      <span>{item.label}</span>
      {!item.phase1 && (
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-neutral-500">Soon</span>
      )}
    </Link>
  );
}

function Group({ item, activeHref, onNavigate }: { item: NavItem; activeHref: string | null; onNavigate?: () => void }) {
  const hasActiveChild = !!item.children?.some((c) => c.href === activeHref);
  const [open, setOpen] = useState(hasActiveChild);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition ${
          hasActiveChild ? "font-semibold text-[#a6e05a]" : "text-neutral-300 hover:bg-white/5 hover:text-neutral-200"
        }`}
      >
        <span>{item.label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? "rotate-90" : ""}`}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
      {open && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-neutral-800 pl-2">
          {item.children!.map((c) => <Leaf key={c.key} item={c} active={c.href === activeHref} onNavigate={onNavigate} />)}
        </div>
      )}
    </div>
  );
}

export function AppNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeHref = computeActiveHref(items, pathname);
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
      {items.map((item) =>
        item.children?.length ? (
          <Group key={item.key} item={item} activeHref={activeHref} onNavigate={onNavigate} />
        ) : (
          <Leaf key={item.key} item={item} active={item.href === activeHref} onNavigate={onNavigate} />
        ),
      )}
    </nav>
  );
}
