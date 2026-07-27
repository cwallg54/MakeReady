"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Touch drag-and-drop for kanban boards. Native HTML5 drag events don't fire on
// touch screens, so on a phone we implement it ourselves: press-and-hold a card
// to pick it up, drag it over a lane (auto-scrolling near the screen edges), and
// release to drop. Desktop mouse drag keeps using native DnD and is untouched.
//
// Lanes must carry a `data-kanban-col="<key>"` attribute so we can find the drop
// target under the finger.

const LONG_PRESS_MS = 200;
const MOVE_ABORT_PX = 12;
const EDGE = 90; // px from top/bottom where auto-scroll kicks in

export interface Ghost {
  x: number;
  y: number;
  label: string;
}

export function useTouchKanban(editable: boolean, onDrop: (id: string, col: string) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);

  const startRef = useRef<(e: React.TouchEvent, id: string, label: string) => void>(() => {});
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  useEffect(() => {
    if (!editable) return;
    const st = { id: null as string | null, label: "", x0: 0, y0: 0, x: 0, y: 0, active: false, timer: 0, raf: 0 };
    const overRef = { c: null as string | null };

    const setOver = (c: string | null) => {
      overRef.c = c;
      setOverCol(c);
    };
    const colAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return (el?.closest("[data-kanban-col]") as HTMLElement | null)?.dataset.kanbanCol ?? null;
    };
    const reset = () => {
      if (st.timer) clearTimeout(st.timer);
      if (st.raf) cancelAnimationFrame(st.raf);
      st.id = null;
      st.active = false;
      st.timer = 0;
      st.raf = 0;
      setDragId(null);
      setOver(null);
      setGhost(null);
    };
    // While the finger sits near a screen edge, scroll the page so the user can
    // reach lanes that are off-screen, and keep the drop target current.
    const tick = () => {
      if (!st.active) {
        st.raf = 0;
        return;
      }
      const h = window.innerHeight;
      let dir = 0;
      if (st.y < EDGE) dir = -1;
      else if (st.y > h - EDGE) dir = 1;
      if (dir) {
        window.scrollBy(0, dir * 12);
        setOver(colAt(st.x, st.y));
      }
      st.raf = requestAnimationFrame(tick);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      st.x = t.clientX;
      st.y = t.clientY;
      if (st.active) {
        e.preventDefault(); // stop the page from scrolling while dragging
        setGhost({ x: t.clientX, y: t.clientY, label: st.label });
        setOver(colAt(t.clientX, t.clientY));
      } else if (st.id && Math.hypot(t.clientX - st.x0, t.clientY - st.y0) > MOVE_ABORT_PX) {
        // Moved before the hold completed → the user is scrolling, not dragging.
        clearTimeout(st.timer);
        st.timer = 0;
        st.id = null;
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (st.active) {
        e.preventDefault();
        if (st.id && overRef.c) dropRef.current(st.id, overRef.c);
      }
      reset();
    };

    startRef.current = (e, id, label) => {
      const t = e.touches[0];
      if (!t) return;
      st.id = id;
      st.label = label;
      st.x0 = st.x = t.clientX;
      st.y0 = st.y = t.clientY;
      st.active = false;
      if (st.timer) clearTimeout(st.timer);
      st.timer = window.setTimeout(() => {
        st.active = true;
        setDragId(id);
        setGhost({ x: st.x, y: st.y, label });
        setOver(colAt(st.x, st.y));
        navigator.vibrate?.(20);
        st.raf = requestAnimationFrame(tick);
      }, LONG_PRESS_MS);
    };

    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      reset();
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
      startRef.current = () => {};
    };
  }, [editable]);

  const onCardTouchStart = useCallback((e: React.TouchEvent, id: string, label: string) => {
    startRef.current(e, id, label);
  }, []);

  return { dragId, overCol, ghost, onCardTouchStart };
}

// The floating card that follows the finger while dragging.
export function DragGhost({ ghost }: { ghost: Ghost | null }) {
  if (!ghost) return null;
  return (
    <div
      className="pointer-events-none fixed z-[60] max-w-[70vw] truncate rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-2xl"
      style={{ left: ghost.x, top: ghost.y, transform: "translate(-50%, -50%) rotate(-3deg) scale(1.04)" }}
    >
      {ghost.label}
    </div>
  );
}
