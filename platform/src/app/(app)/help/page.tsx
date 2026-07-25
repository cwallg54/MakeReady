import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { articlesBySection } from "@/lib/help/content";
import { HelpCatalog } from "@/components/help/help-catalog";

export const metadata = { title: "Help — MakeReady" };

export default async function HelpIndexPage() {
  await requireUser();
  const sections = articlesBySection().map((g) => ({
    section: g.section,
    articles: g.articles.map((a) => ({ slug: a.slug, title: a.title, section: a.section, summary: a.summary })),
  }));

  return (
    <div className="max-w-4xl">
      <PageHeader title="Help Center" description="Step-by-step guides for every feature in MakeReady. Search, or browse by area." />
      <HelpCatalog sections={sections} />
    </div>
  );
}
