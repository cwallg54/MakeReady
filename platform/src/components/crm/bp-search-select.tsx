"use client";

import { useEffect, useRef, useState } from "react";

interface Hit {
  id: string;
  name: string;
  bpNumber: string;
}

// Typeahead picker for a Business Partner. Submits the chosen id in a hidden
// input named `name`. Backed by /api/crm/bp-search (handles 7k+ customers).
export function BpSearchSelect({
  name,
  defaultId = "",
  defaultLabel = "",
  placeholder = "Search customer by name or BP #…",
}: {
  name: string;
  defaultId?: string;
  defaultLabel?: string;
  placeholder?: string;
}) {
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(defaultId ? { id: defaultId, label: defaultLabel || defaultId } : null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/crm/bp-search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (r.ok) setHits(await r.json());
      } catch { /* aborted */ }
      setLoading(false);
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand";

  return (
    <div className="relative" ref={boxRef}>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      {selected ? (
        <div className="flex items-center justify-between rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
          <span className="truncate text-neutral-900">{selected.label}</span>
          <button type="button" onClick={() => { setSelected(null); setQuery(""); setOpen(true); }} className="ml-2 shrink-0 text-neutral-400 hover:text-neutral-700" aria-label="Clear">✕</button>
        </div>
      ) : (
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={input}
          autoComplete="off"
        />
      )}
      {open && !selected && (query.trim().length >= 2 || hits.length > 0) && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg">
          {loading && <li className="px-3 py-2 text-sm text-neutral-400">Searching…</li>}
          {!loading && hits.length === 0 && <li className="px-3 py-2 text-sm text-neutral-400">No matches.</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => { setSelected({ id: h.id, label: h.name }); setOpen(false); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"
              >
                <span className="truncate text-neutral-900">{h.name}</span>
                <span className="shrink-0 font-mono text-xs text-neutral-400">{h.bpNumber}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
