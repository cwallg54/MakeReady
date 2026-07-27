"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SOURCE_META, OPS_BY_TYPE, type ReportConfig, type ReportFilter, type FilterOp } from "@/lib/reports/sources";
import { saveReport, previewReport } from "@/lib/reports/actions";

const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-neutral-500";

export interface BuilderInitial { id?: string; name: string; description: string; source: string; config: ReportConfig }

export function ReportBuilder({ initial }: { initial?: BuilderInitial }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [source, setSource] = useState(initial?.source ?? SOURCE_META[0].key);
  const meta = useMemo(() => SOURCE_META.find((s) => s.key === source)!, [source]);
  const [columns, setColumns] = useState<string[]>(initial?.config.columns?.length ? initial.config.columns : SOURCE_META.find((s) => s.key === (initial?.source ?? SOURCE_META[0].key))!.fields.map((f) => f.key));
  const [filters, setFilters] = useState<ReportFilter[]>(initial?.config.filters ?? []);
  const [sortField, setSortField] = useState(initial?.config.sortField ?? "");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial?.config.sortDir ?? "asc");
  const [rowLimit, setRowLimit] = useState(initial?.config.rowLimit ?? 1000);
  const [preview, setPreview] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  function changeSource(s: string) {
    setSource(s);
    const m = SOURCE_META.find((x) => x.key === s)!;
    setColumns(m.fields.map((f) => f.key));
    setFilters([]); setSortField(""); setPreview(null);
  }
  const toggleCol = (k: string) => setColumns((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]));
  const fieldType = (k: string) => meta.fields.find((f) => f.key === k)?.type ?? "text";
  const label = (k: string) => meta.fields.find((f) => f.key === k)?.label ?? k;
  const filterableFields = meta.fields.filter((f) => f.filterable !== false);

  const config = (): ReportConfig => ({ columns, filters: filters.filter((f) => f.field), sortField: sortField || undefined, sortDir, rowLimit: Number(rowLimit) || 1000 });

  function runPreview() {
    setErr("");
    start(async () => {
      try { setPreview(await previewReport(source, config())); }
      catch { setErr("Preview failed — check your filters."); }
    });
  }
  function save() {
    if (!name.trim()) { setErr("Give the report a name."); return; }
    if (columns.length === 0) { setErr("Pick at least one column."); return; }
    start(async () => {
      const { id } = await saveReport({ id: initial?.id, name, description, source, config: config() });
      router.push(`/reports/${id}`);
    });
  }

  return (
    <div className="space-y-5">
      {err && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs text-neutral-500">Report name<input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${input}`} placeholder="e.g. Utah customers, open orders" /></label>
        <label className="flex flex-col text-xs text-neutral-500">Data source<select value={source} onChange={(e) => changeSource(e.target.value)} className={`mt-1 ${input}`}>{SOURCE_META.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        <label className="flex flex-col text-xs text-neutral-500 sm:col-span-2">Description<input value={description} onChange={(e) => setDescription(e.target.value)} className={`mt-1 ${input}`} /></label>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Columns</p>
        <div className="flex flex-wrap gap-2">
          {meta.fields.map((f) => (
            <label key={f.key} className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${columns.includes(f.key) ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-600"}`}>
              <input type="checkbox" checked={columns.includes(f.key)} onChange={() => toggleCol(f.key)} className="hidden" />{f.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Filters</p>
          <button type="button" onClick={() => setFilters((f) => [...f, { field: filterableFields[0]?.key ?? "", op: "contains", value: "" }])} className="text-xs font-medium text-neutral-700 hover:text-neutral-900">+ Add filter</button>
        </div>
        <div className="space-y-2">
          {filters.length === 0 && <p className="text-xs text-neutral-400">No filters — all rows.</p>}
          {filters.map((flt, i) => {
            const ops = OPS_BY_TYPE[fieldType(flt.field)];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select value={flt.field} onChange={(e) => setFilters((fs) => fs.map((x, idx) => idx === i ? { ...x, field: e.target.value, op: OPS_BY_TYPE[fieldType(e.target.value)][0].op } : x))} className={input}>
                  {filterableFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={flt.op} onChange={(e) => setFilters((fs) => fs.map((x, idx) => idx === i ? { ...x, op: e.target.value as FilterOp } : x))} className={input}>
                  {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                </select>
                <input value={flt.value} onChange={(e) => setFilters((fs) => fs.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))} placeholder="value" className={`${input} w-40`} />
                <button type="button" onClick={() => setFilters((fs) => fs.filter((_, idx) => idx !== i))} className="text-neutral-400 hover:text-red-600">×</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-neutral-500">Sort by<select value={sortField} onChange={(e) => setSortField(e.target.value)} className={`mt-1 ${input}`}><option value="">(none)</option>{meta.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
        <label className="flex flex-col text-xs text-neutral-500">Direction<select value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")} className={`mt-1 ${input}`}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
        <label className="flex flex-col text-xs text-neutral-500">Row limit<input type="number" value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value))} className={`mt-1 w-28 ${input}`} /></label>
        <button type="button" onClick={runPreview} disabled={pending} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">{pending ? "…" : "Preview"}</button>
        <button type="button" onClick={save} disabled={pending} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-60">{initial?.id ? "Save changes" : "Save report"}</button>
      </div>

      {preview && (
        <div className="rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-2 text-xs text-neutral-400">Preview — first {preview.rows.length} rows</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-400"><tr>{preview.columns.map((c) => <th key={c} className="px-3 py-2">{label(c)}</th>)}</tr></thead>
              <tbody className="divide-y divide-neutral-100">
                {preview.rows.map((r, i) => (
                  <tr key={i}>{preview.columns.map((c) => <td key={c} className="px-3 py-1.5 text-neutral-700">{r[c] == null ? "" : String(r[c]).slice(0, 60)}</td>)}</tr>
                ))}
                {preview.rows.length === 0 && <tr><td colSpan={preview.columns.length} className="px-3 py-6 text-center text-neutral-400">No rows match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
