import { NextResponse } from "next/server";

/** Quote a single CSV cell (RFC-4180): wrap in quotes if it contains a comma,
 *  quote, or newline; double any embedded quotes. */
export function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from a header row and data rows. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\r\n");
}

/** A downloadable text/csv response. */
export function csvResponse(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): NextResponse {
  return new NextResponse(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    },
  });
}
