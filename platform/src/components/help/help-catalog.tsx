"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

interface Item {
  slug: string;
  title: string;
  section: string;
  summary: string;
}

export function HelpCatalog({ sections }: { sections: { section: string; articles: Item[] }[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!query) return sections;
    return sections
      .map((g) => ({
        section: g.section,
        articles: g.articles.filter(
          (a) =>
            a.title.toLowerCase().includes(query) ||
            a.summary.toLowerCase().includes(query) ||
            a.section.toLowerCase().includes(query),
        ),
      }))
      .filter((g) => g.articles.length > 0);
  }, [sections, query]);

  return (
    <div>
      <div className="mb-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help articles…"
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500"
        />
      </div>

      {filtered.length === 0 && <p className="text-sm text-neutral-500">No articles match “{q}”.</p>}

      <div className="space-y-8">
        {filtered.map((g) => (
          <section key={g.section}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">{g.section}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.articles.map((a) => (
                <Link
                  key={a.slug}
                  href={`/help/${a.slug}`}
                  className="block rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 hover:shadow-sm"
                >
                  <div className="text-sm font-semibold text-neutral-900">{a.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-neutral-500">{a.summary}</div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
