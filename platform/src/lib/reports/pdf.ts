import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { displayValue, groupRows, type ReportResult } from "./run";

const MARGIN = 40;
const ROW_H = 15;
const FS = 8;
const NAVY = rgb(0.06, 0.09, 0.16);
const GRAY = rgb(0.4, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const BAND = rgb(0.95, 0.96, 0.98);

interface Opts { title: string; labels: Record<string, string>; groupField?: string; numericCols: string[] }

const fmt = (v: unknown) => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : displayValue(v);
};

export async function reportToPdf(result: ReportResult, opts: Opts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageW = 792, pageH = 612;
  const usable = pageW - MARGIN * 2;
  const cols = result.columns;
  const colW = usable / Math.max(cols.length, 1);
  const maxChars = Math.max(4, Math.floor(colW / (FS * 0.52)));
  const numeric = new Set(opts.numericCols.filter((c) => cols.includes(c)));

  const trunc = (s: string) => (s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s);
  const st = { page: null as unknown as PDFPage, y: 0 };

  const drawHeaderRow = () => {
    st.page.drawRectangle({ x: MARGIN, y: st.y - 3, width: usable, height: ROW_H, color: NAVY });
    cols.forEach((c, i) => st.page.drawText(trunc(opts.labels[c] ?? c), { x: MARGIN + i * colW + 3, y: st.y + 1, size: FS, font: bold, color: rgb(1, 1, 1) }));
    st.y -= ROW_H;
  };
  const newPage = (withTitle = false) => {
    st.page = doc.addPage([pageW, pageH]);
    st.y = pageH - MARGIN;
    if (withTitle) {
      st.page.drawText(opts.title, { x: MARGIN, y: st.y - 6, size: 14, font: bold, color: NAVY });
      st.page.drawText(`${result.rows.length.toLocaleString()} rows`, { x: MARGIN, y: st.y - 20, size: 8, font, color: GRAY });
      st.y -= 34;
    }
    drawHeaderRow();
  };
  const ensure = (needed = ROW_H) => { if (st.y - needed < MARGIN) newPage(); };

  const drawRow = (r: Record<string, unknown>, opt: { band?: boolean; bold?: boolean } = {}) => {
    ensure();
    if (opt.band) st.page.drawRectangle({ x: MARGIN, y: st.y - 3, width: usable, height: ROW_H, color: BAND });
    cols.forEach((c, i) => {
      const val = numeric.has(c) ? fmt(r[c]) : displayValue(r[c]);
      const tx = trunc(val);
      const x = numeric.has(c) ? MARGIN + (i + 1) * colW - 3 - font.widthOfTextAtSize(tx, FS) : MARGIN + i * colW + 3;
      st.page.drawText(tx, { x, y: st.y + 1, size: FS, font: opt.bold ? bold : font, color: NAVY });
    });
    st.page.drawLine({ start: { x: MARGIN, y: st.y - 3 }, end: { x: MARGIN + usable, y: st.y - 3 }, thickness: 0.3, color: LINE });
    st.y -= ROW_H;
  };
  const subtotalRow = (label: string, sums: Record<string, number>) => {
    const r: Record<string, unknown> = {};
    r[cols[0]] = label;
    for (const c of numeric) r[c] = sums[c];
    drawRow(r, { band: true, bold: true });
  };

  newPage(true);

  if (opts.groupField && cols.includes(opts.groupField)) {
    const { groups, grand } = groupRows(result, opts.groupField, opts.numericCols);
    const gLabel = opts.labels[opts.groupField] ?? opts.groupField;
    for (const g of groups) {
      ensure(ROW_H * 2);
      st.page.drawText(`${gLabel}: ${trunc(g.label)} (${g.rows.length})`, { x: MARGIN, y: st.y, size: FS + 1, font: bold, color: NAVY });
      st.y -= ROW_H;
      for (const row of g.rows) drawRow(row);
      subtotalRow("Subtotal", g.subtotals);
      st.y -= 6;
    }
    subtotalRow("GRAND TOTAL", grand);
  } else {
    for (const row of result.rows) drawRow(row);
  }

  return doc.save();
}
