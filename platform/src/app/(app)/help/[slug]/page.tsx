import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { Card } from "@/components/ui";
import { HelpImage } from "@/components/help/help-image";
import { getArticle, getArticle as _g, HELP_ARTICLES, type HelpBlock } from "@/lib/help/content";

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.k) {
    case "p":
      return <p className="my-3 text-sm leading-relaxed text-neutral-700">{block.text}</p>;
    case "h":
      return <h2 className="mb-2 mt-7 text-base font-semibold text-neutral-900">{block.text}</h2>;
    case "img":
      return <HelpImage src={block.src} caption={block.caption} />;
    case "list":
      return (
        <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-neutral-700">
          {block.items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      );
    case "steps":
      return (
        <ol className="my-4 space-y-4">
          {block.items.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-neutral-700">{s.text}</p>
                {s.img && <HelpImage src={s.img} caption={s.caption} />}
              </div>
            </li>
          ))}
        </ol>
      );
    case "tip":
      return (
        <div className="my-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span className="font-semibold">Tip · </span>{block.text}
        </div>
      );
    case "warn":
      return (
        <div className="my-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">Note · </span>{block.text}
        </div>
      );
  }
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const related = (article.related ?? []).map((s) => _g(s)).filter(Boolean);

  return (
    <div className="max-w-3xl">
      <Link href="/help" className="mb-3 inline-block text-sm text-neutral-500 hover:text-neutral-800">← Help Center</Link>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{article.section}</div>
      <h1 className="text-2xl font-bold text-neutral-900">{article.title}</h1>
      <p className="mt-1 text-sm text-neutral-500">{article.summary}</p>
      {article.who && (
        <div className="mt-3 inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">Who: {article.who}</div>
      )}

      <div className="mt-6">
        {article.blocks.map((b, i) => <Block key={i} block={b} />)}
      </div>

      {related.length > 0 && (
        <Card className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Related articles</h2>
          <ul className="space-y-1.5">
            {related.map((r) => (
              <li key={r!.slug}>
                <Link href={`/help/${r!.slug}`} className="text-sm text-blue-700 hover:underline">{r!.title}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
