"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setStageAction } from "@/lib/crm/actions";

export interface PipelineCard {
  id: string;
  companyName: string;
  stage: string;
  leadSource: string | null;
  ownerName: string | null;
  tags: string[] | null;
}

const COLUMNS = [
  { key: "lead", label: "Leads", accent: "border-t-amber-400" },
  { key: "prospect", label: "Prospects", accent: "border-t-blue-400" },
  { key: "customer", label: "Customers", accent: "border-t-emerald-400" },
] as const;

export function PipelineBoard({ cards, editable }: { cards: PipelineCard[]; editable: boolean }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function move(id: string, stage: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("stage", stage);
    startTransition(async () => {
      await setStageAction(fd);
      router.refresh();
    });
  }

  return (
    <>
      {editable && <p className="mb-3 text-xs text-neutral-400">Drag a card between columns to change its stage.{pending ? " · saving…" : ""}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = cards.filter((c) => c.stage === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (editable) { e.preventDefault(); setOverCol(col.key); } }}
              onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
              onDrop={() => { if (editable && dragId) move(dragId, col.key); setOverCol(null); }}
              className={`rounded-lg border border-neutral-200 border-t-4 ${col.accent} bg-neutral-50 ${overCol === col.key ? "ring-2 ring-neutral-400" : ""}`}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-semibold text-neutral-900">{col.label}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-neutral-500">{items.length}</span>
              </div>
              <div className="min-h-16 space-y-2 px-3 pb-3">
                {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-neutral-400">Nothing here yet.</p>}
                {items.map((r) => (
                  <div
                    key={r.id}
                    draggable={editable}
                    onDragStart={() => setDragId(r.id)}
                    onDragEnd={() => setDragId(null)}
                    className={`rounded-lg border border-neutral-200 bg-white p-3 shadow-sm ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <Link href={`/crm/${r.id}`} className="text-sm font-medium text-neutral-900 hover:underline">{r.companyName}</Link>
                    <p className="mt-0.5 text-xs text-neutral-500">{r.ownerName ?? "Unassigned"}{r.leadSource ? ` · ${r.leadSource}` : ""}</p>
                    {r.tags && r.tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {r.tags.map((t) => <span key={t} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
