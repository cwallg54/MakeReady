import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/service";
import { PageHeader } from "@/components/ui";
import { runSiteSearch, aiSearchAnswer } from "@/lib/search/site-search";

export const dynamic = "force-dynamic";

const input = "rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const groups = query ? await runSiteSearch(query, user.roles) : [];
  const answer = query ? await aiSearchAnswer(query, groups) : null;
  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <div className="max-w-3xl">
      <PageHeader title="Search" description="Find anything across the platform — customers, orders, invoices, designs — with AI." />
      <form action="/search" className="mb-6 mt-4 flex gap-2">
        <input name="q" defaultValue={query} autoFocus placeholder="Search customers, orders, invoices, designs…" className={`flex-1 ${input}`} />
        <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Search</button>
      </form>

      {query && answer && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm leading-relaxed text-neutral-800">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-blue-400">AI answer</p>
          {answer}
        </div>
      )}
      {query && total === 0 && <p className="text-sm text-neutral-500">No matches for “{query}”.</p>}

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.key}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{g.label}</h2>
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {g.hits.map((h, i) => (
                <li key={i}>
                  <Link href={h.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50">
                    <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">{h.type}</span>
                    <span className="truncate text-sm font-medium text-neutral-900">{h.label}</span>
                    {h.sublabel && <span className="shrink-0 text-xs text-neutral-400">{h.sublabel}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {!query && <p className="text-sm text-neutral-400">Type a name, number, or description above to search.</p>}
    </div>
  );
}
