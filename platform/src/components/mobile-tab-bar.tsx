"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SpeedDialAction {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

export interface MobileTab {
  key: string;
  label: string;
  href: string;
  /** Icon path drawn inside a 24x24 stroke SVG. */
  icon: React.ReactNode;
  /** Elevated center action (e.g. New). */
  primary?: boolean;
  /** When set (2+), the primary button becomes a press-and-hold speed dial. */
  actions?: SpeedDialAction[];
}

// Field-sales bottom navigation. Rendered only below the `lg` breakpoint, so the
// desktop layout is never affected.
export function MobileTabBar({ tabs }: { tabs: MobileTab[] }) {
  const pathname = usePathname() ?? "";

  // Longest matching href wins, so /sales/orders beats /sales, and
  // /sales/quotes/new beats /sales.
  let activeKey = "";
  let bestLen = -1;
  for (const t of tabs) {
    const matches = pathname === t.href || pathname.startsWith(t.href + "/");
    if (matches && t.href.length > bestLen) {
      bestLen = t.href.length;
      activeKey = t.key;
    }
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map((t) => {
          const active = t.key === activeKey;
          if (t.primary && t.actions && t.actions.length > 1) {
            return <SpeedDialTab key={t.key} tab={t} active={active} />;
          }
          if (t.primary) {
            return (
              <li key={t.key} className="flex flex-1 justify-center">
                <Link
                  href={t.href}
                  aria-label={t.label}
                  aria-current={active ? "page" : undefined}
                  className="-mt-5 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-neutral-900 text-white shadow-lg shadow-neutral-900/30 active:scale-95"
                >
                  <span className="h-6 w-6">{t.icon}</span>
                  <span className="text-[10px] font-semibold leading-none">{t.label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={t.key} className="flex flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-[#5f9e0f]" : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                <span className={`h-6 w-6 ${active ? "opacity-100" : "opacity-80"}`}>{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Accent gradient per action for a bit of graphical delight.
const ACTION_COLOR: Record<string, string> = {
  "new-customer": "bg-gradient-to-br from-indigo-500 to-violet-600 ring-violet-500/30",
  "new-bp": "bg-gradient-to-br from-indigo-500 to-violet-600 ring-violet-500/30",
  "new-quote": "bg-gradient-to-br from-neutral-700 to-neutral-900 ring-neutral-900/30",
  pipeline: "bg-gradient-to-br from-emerald-500 to-teal-600 ring-teal-500/30",
  list: "bg-gradient-to-br from-sky-500 to-blue-600 ring-blue-500/30",
};

// Springy overshoot so the actions "pop" as they appear.
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// Shared fan of action pills (gradient chip + sliding label), reused by the
// center speed-dial tab and the corner speed-dial FAB.
function SpeedDialActions({ actions, open, onNavigate }: { actions: SpeedDialAction[]; open: boolean; onNavigate: () => void }) {
  return (
    <>
      {actions.map((a, i) => {
        const delay = open ? (actions.length - 1 - i) * 65 : 0;
        return (
          <Link
            key={a.key}
            href={a.href}
            onClick={onNavigate}
            className="flex items-center gap-3 will-change-transform"
            style={{
              transition: `transform 420ms ${SPRING} ${delay}ms, opacity 240ms ease-out ${delay}ms`,
              transform: open ? "translateY(0) scale(1)" : "translateY(28px) scale(0.35)",
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
            }}
          >
            <span
              className="whitespace-nowrap rounded-lg bg-white/95 px-2.5 py-1 text-sm font-semibold text-neutral-800 shadow-md ring-1 ring-black/5 backdrop-blur"
              style={{
                transition: `transform 320ms ease-out ${delay + 90}ms, opacity 260ms ease-out ${delay + 90}ms`,
                transform: open ? "translateX(0)" : "translateX(14px)",
                opacity: open ? 1 : 0,
              }}
            >
              {a.label}
            </span>
            <span className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg ring-4 ${ACTION_COLOR[a.key] ?? "bg-neutral-900 ring-neutral-900/30"}`}>
              <span className="h-5 w-5">{a.icon}</span>
            </span>
          </Link>
        );
      })}
    </>
  );
}

function SpeedDialTab({ tab, active }: { tab: MobileTab; active: boolean }) {
  const [open, setOpen] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHold = useRef(false);
  const actions = tab.actions ?? [];

  const startHold = () => {
    openedByHold.current = false;
    holdTimer.current = setTimeout(() => {
      openedByHold.current = true;
      setOpen(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(18);
    }, 280);
  };
  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const onButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // If a long-press already opened the dial, swallow the trailing click.
    if (openedByHold.current) {
      openedByHold.current = false;
      return;
    }
    setOpen((o) => !o);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
  };

  return (
    <li className={`relative flex flex-1 justify-center ${open ? "z-50" : ""}`}>
      {/* Dimmed, blurred backdrop — blur ramps in with the menu */}
      <button
        type="button"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-neutral-950/45 transition-all duration-300 ${
          open ? "opacity-100 backdrop-blur-md" : "pointer-events-none opacity-0 backdrop-blur-0"
        }`}
      />

      {/* Fan of actions, stacked above the + button */}
      <div className="absolute bottom-full left-1/2 z-50 mb-4 flex -translate-x-1/2 flex-col items-end gap-3.5">
        <SpeedDialActions actions={actions} open={open} onNavigate={() => setOpen(false)} />
      </div>

      {/* The + / × button */}
      <button
        type="button"
        aria-label={tab.label}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-current={active ? "page" : undefined}
        onClick={onButtonClick}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative z-50 -mt-5 flex h-14 w-14 flex-col items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 active:scale-90 ${
          open ? "scale-110 bg-neutral-700 shadow-neutral-900/40" : "bg-neutral-900 shadow-neutral-900/30"
        }`}
        style={{ touchAction: "none", transitionTimingFunction: SPRING }}
      >
        {/* Idle pulse ring — a gentle sonar hint that the button is interactive */}
        {!open && (
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-neutral-900/25 animate-ping" style={{ animationDuration: "2.8s" }} />
        )}
        <span className={`h-6 w-6 transition-transform duration-300 ${open ? "rotate-[135deg]" : ""}`} style={{ transitionTimingFunction: SPRING }}>{tab.icon}</span>
        <span className="text-[10px] font-semibold leading-none">{open ? "Close" : tab.label}</span>
      </button>
    </li>
  );
}

/**
 * Floating corner speed-dial for contextual page actions (e.g. New Business
 * Partner + Pipeline). Mirrors the center tab's animation. Mobile only — the
 * desktop keeps its normal header buttons.
 */
export function SpeedDialFab({ actions, ariaLabel = "Quick actions", icon }: { actions: SpeedDialAction[]; ariaLabel?: string; icon?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHold = useRef(false);
  const mainIcon = icon ?? TAB_ICONS.apps;

  const startHold = () => {
    openedByHold.current = false;
    holdTimer.current = setTimeout(() => {
      openedByHold.current = true;
      setOpen(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(18);
    }, 280);
  };
  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const onButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (openedByHold.current) {
      openedByHold.current = false;
      return;
    }
    setOpen((o) => !o);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
  };

  if (actions.length === 0) return null;

  return (
    <div className="lg:hidden">
      {/* Dimmed, blurred backdrop */}
      <button
        type="button"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-neutral-950/45 transition-all duration-300 ${open ? "opacity-100 backdrop-blur-md" : "pointer-events-none opacity-0 backdrop-blur-0"}`}
      />

      {/* FAB anchored bottom-right, above the tab bar */}
      <div className="fixed right-4 z-50" style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.25rem)" }}>
        <div className="absolute bottom-full right-0 mb-4 flex flex-col items-end gap-3.5">
          <SpeedDialActions actions={actions} open={open} onNavigate={() => setOpen(false)} />
        </div>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={onButtonClick}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onContextMenu={(e) => e.preventDefault()}
          className={`relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition-all duration-300 active:scale-90 ${open ? "scale-110 bg-neutral-700 shadow-neutral-900/40" : "bg-neutral-900 shadow-neutral-900/30"}`}
          style={{ touchAction: "none", transitionTimingFunction: SPRING }}
        >
          {!open && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-neutral-900/25 animate-ping" style={{ animationDuration: "2.8s" }} />}
          {/* Cross-fade the tools icon into a close (×) */}
          <span className="relative h-6 w-6">
            <span className="absolute inset-0 transition-all duration-300" style={{ transitionTimingFunction: SPRING, opacity: open ? 0 : 1, transform: open ? "rotate(90deg) scale(0.5)" : "none" }}>{mainIcon}</span>
            <span className="absolute inset-0 transition-all duration-300" style={{ transitionTimingFunction: SPRING, opacity: open ? 1 : 0, transform: open ? "none" : "rotate(-90deg) scale(0.5)" }}>{TAB_ICONS.close}</span>
          </span>
        </button>
      </div>
    </div>
  );
}

// Shared 24x24 stroke icons.
const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
    {children}
  </svg>
);

export const TAB_ICONS = {
  home: svg(<><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /></>),
  accounts: svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6.5a3 3 0 0 1 0 5" /><path d="M18 20a6 6 0 0 0-3-5.2" /></>),
  plus: svg(<><path d="M12 6v12" /><path d="M6 12h12" /></>),
  quotes: svg(<><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M9 12h6" /><path d="M9 16h6" /></>),
  orders: svg(<><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5" /><path d="M12 12v9" /></>),
  userPlus: svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a6 6 0 0 1 11 0" /><path d="M18.5 8v6" /><path d="M15.5 11h6" /></>),
  board: svg(<><rect x="3" y="4" width="4.5" height="16" rx="1" /><rect x="9.75" y="4" width="4.5" height="11" rx="1" /><rect x="16.5" y="4" width="4.5" height="14" rx="1" /></>),
  list: svg(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3.5 6h.01" /><path d="M3.5 12h.01" /><path d="M3.5 18h.01" /></>),
  apps: svg(<><circle cx="7" cy="7" r="1.6" /><circle cx="17" cy="7" r="1.6" /><circle cx="7" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /></>),
  close: svg(<><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>),
} as const;
