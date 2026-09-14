import Link from "next/link";
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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-blue-900">The user guide — the whole job, start to finish</p>
          <p className="mt-0.5 text-sm text-blue-800">
            Every stage from the first enquiry to a closed month, and the screen it happens on. Read it here under{" "}
            <strong>User Guide</strong>, or take a copy away.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/help/guide-overview"
            className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
          >
            Start reading
          </Link>
          <a
            href="/help/MakeReady_User_Guide.docx"
            download
            className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100"
          >
            Download (Word)
          </a>
        </div>
      </div>

      <HelpCatalog sections={sections} />
    </div>
  );
}
