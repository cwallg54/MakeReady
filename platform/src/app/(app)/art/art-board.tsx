"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setArtStatusAction, assignArtAction } from "@/lib/art/actions";
import { useTouchKanban, DragGhost } from "@/components/kanban-touch";

export interface ArtCard {
  id: string;
  status: string;
  rush: boolean;
  priority: string;
  estimatedMinutes: number | null;
  dueLabel: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  orderId: string;
  orderNumber: string;
  company: string;
}

const PRIORITY_BADGE: Record<string, string> = { p1: "bg-red-600 text-white", p2: "bg-amber-500 text-white" };

const COLUMNS: { key: string; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "proofing", label: "Proofing" },
  { key: "revisions", label: "Revisions" },
  { key: "approved", label: "Approved" },
  { key: "done", label: "Done" },
];

const inputCls = "rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs text-neutral-800 outline-none focus:border-brand";

export function ArtBoard({ cards, team, meId }: { cards: ArtCard[]; team: { id: string; name: string }[]; meId: string }) {
  const [view, setView] = useState<"kanban" | "queue">("kanban");
  const [dragId, setDragId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const touch = useTouchKanban(true, move);

  function move(id: string, status: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.status === status) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    startTransition(async () => {
      await setArtStatusAction(fd);
      router.refresh();
    });
  }
  function assign(id: string, assignedTo: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("assignedTo", assignedTo);
    startTransition(async () => {
      await assignArtAction(fd);
      router.refresh();
    });
  }

  const Assignee = ({ c }: { c: ArtCard }) => (
    <select
      value={c.assignedTo ?? "__none"}
      onChange={(e) => assign(c.id, e.target.value)}
      className={inputCls}
      title="Assignee"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <option value="__none">Unassigned</option>
      <option value="__me">Me</option>
      {team.map((u) => (
        <option key={u.id} value={u.id}>{u.id === meId ? `${u.name} (me)` : u.name}</option>
      ))}
    </select>
  );

  const Card = ({ c, draggable }: { c: ArtCard; draggable?: boolean }) => (
    <div
      draggable={draggable}
      onDragStart={() => setDragId(c.id)}
      onDragEnd={() => setDragId(null)}
      onTouchStart={draggable ? (e) => touch.onCardTouchStart(e, c.id, c.orderNumber) : undefined}
      onContextMenu={(e) => { if (draggable) e.preventDefault(); }}
      className={`rounded-lg border border-neutral-200 bg-white p-3 shadow-sm ${draggable ? "cursor-grab select-none active:cursor-grabbing" : ""} ${touch.dragId === c.id ? "opacity-40" : ""}`}
    >
      <div className="flex items-center justify-between gap-1">
        <Link href={`/art/${c.id}`} className="text-sm font-semibold text-neutral-900 hover:underline">{c.orderNumber}</Link>
        <span className="flex items-center gap-1">
          {c.priority !== "none" && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_BADGE[c.priority]}`}>{c.priority}</span>}
          {c.rush && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Rush</span>}
        </span>
      </div>
      <p className="truncate text-xs text-neutral-500">{c.company}</p>
      <p className="mt-1 text-[11px] text-neutral-400">{c.dueLabel ? `Due ${c.dueLabel}` : "No due date"}{c.estimatedMinutes ? ` · ~${(c.estimatedMinutes / 60).toFixed(1)}h` : ""}</p>
      <div className="mt-2"><Assignee c={c} /></div>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-neutral-300">
          {(["kanban", "queue"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm font-medium capitalize ${view === v ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}
            >
              {v}
            </button>
          ))}
        </div>
        {pending && <span className="text-xs text-neutral-400">saving…</span>}
      </div>

      {view === "kanban" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map((col) => {
            const colCards = cards.filter((c) => c.status === col.key);
            return (
              <div
                key={col.key}
                data-kanban-col={col.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragId && move(dragId, col.key)}
                className={`flex min-h-32 flex-col rounded-xl border border-neutral-200 bg-neutral-50 p-2 transition-shadow ${touch.overCol === col.key ? "ring-2 ring-neutral-500" : ""}`}
              >
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-neutral-700">{col.label}</span>
                  <span className="rounded-full bg-neutral-200 px-1.5 text-[10px] text-neutral-600">{colCards.length}</span>
                </div>
                <div className="space-y-2">
                  {colCards.map((c) => <Card key={c.id} c={c} draggable />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assignee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {cards.map((c) => (
                <tr key={c.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <Link href={`/art/${c.id}`} className="font-medium text-neutral-900 hover:underline">{c.orderNumber}</Link>
                    {c.rush && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Rush</span>}
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{c.company}</td>
                  <td className="px-3 py-2 text-neutral-500">{c.dueLabel ?? "—"}</td>
                  <td className="px-3 py-2">
                    <select value={c.status} onChange={(e) => move(c.id, e.target.value)} className={inputCls}>
                      {COLUMNS.map((col) => <option key={col.key} value={col.key}>{col.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><Assignee c={c} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <DragGhost ghost={touch.ghost} />
    </div>
  );
}
