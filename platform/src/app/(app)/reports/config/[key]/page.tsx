import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { canBuildReports } from "@/lib/reports/sources";
import { PageHeader, Card } from "@/components/ui";
import { reportConfig, reportTitle } from "@/lib/reports/report-config";
import { getReportSettings } from "@/lib/reports/settings";
import { saveReportSettingsAction } from "@/lib/reports/config-actions";

export const dynamic = "force-dynamic";

const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500";

export default async function ReportConfigPage({ params }: { params: Promise<{ key: string }> }) {
  const user = await requireModule("reports");
  if (!canBuildReports(user.roles)) redirect("/reports");
  const { key } = await params;
  const def = reportConfig(key);
  if (!def) notFound();
  const settings = await getReportSettings(key);
  const colHidden = new Set(settings.hiddenColumns ?? []);
  const secHidden = new Set(settings.hiddenSections ?? []);

  return (
    <div className="max-w-2xl space-y-6">
      <Link href={def.href} className="text-sm text-neutral-500 hover:text-neutral-900">← Back to report</Link>
      <PageHeader title={`Edit “${reportTitle(def, settings)}”`} description="Configure how this report looks for everyone. Changes are shared across all users." />

      <form action={saveReportSettingsAction} className="space-y-6">
        <input type="hidden" name="key" value={key} />

        <Card>
          <label className="block text-sm font-medium text-neutral-900">Report title
            <input name="title" defaultValue={settings.title ?? def.name} className={`mt-1 ${inp}`} />
          </label>
          <p className="mt-1 text-xs text-neutral-400">Shown as the report heading. Leave as the default name to keep it.</p>
        </Card>

        {def.columns && def.columns.length > 0 && (
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-neutral-900">Columns</h2>
            <p className="mb-3 text-xs text-neutral-500">Untick a column to hide it from the report and its export.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {def.columns.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" name={`col:${c.key}`} defaultChecked={!colHidden.has(c.key)} className="h-4 w-4" /> {c.label}
                </label>
              ))}
            </div>
          </Card>
        )}

        {def.sections && def.sections.length > 0 && (
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-neutral-900">Sections</h2>
            <p className="mb-3 text-xs text-neutral-500">Untick a section to hide it.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {def.sections.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" name={`sec:${s.key}`} defaultChecked={!secHidden.has(s.key)} className="h-4 w-4" /> {s.label}
                </label>
              ))}
            </div>
          </Card>
        )}

        {def.filters && def.filters.length > 0 && (
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-neutral-900">Default filters</h2>
            <p className="mb-3 text-xs text-neutral-500">Applied every time the report opens. Users can still override with the on-page controls where available.</p>
            <div className="space-y-3">
              {def.filters.map((f) => (
                <label key={f.key} className="block text-sm text-neutral-700">{f.label}
                  {f.type === "enum" ? (
                    <select name={`filter:${f.key}`} defaultValue={settings.filters?.[f.key] ?? ""} className={`mt-1 ${inp}`}>
                      <option value="">— no default —</option>
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <input name={`filter:${f.key}`} defaultValue={settings.filters?.[f.key] ?? ""} placeholder={f.placeholder} className={`mt-1 ${inp}`} />
                  )}
                </label>
              ))}
            </div>
          </Card>
        )}

        {def.sortable && def.sortable.length > 0 && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Default sort</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-neutral-700">Sort by
                <select name="sortKey" defaultValue={settings.sortKey ?? ""} className={`mt-1 ${inp}`}>
                  <option value="">— default —</option>
                  {def.sortable.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
              <label className="text-sm text-neutral-700">Direction
                <select name="sortDir" defaultValue={settings.sortDir ?? "desc"} className={`mt-1 ${inp}`}>
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>
            </div>
          </Card>
        )}

        <div className="flex items-center gap-3">
          <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save changes</button>
          <Link href={def.href} className="text-sm text-neutral-500 hover:text-neutral-900">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
