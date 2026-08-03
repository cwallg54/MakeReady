import "server-only";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { businessPartners } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { getCreditAR } from "@/lib/reports/standard-data";
import type { GeneratedPdf } from "./invoice-pdf";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Render an AR statement PDF for a customer: open invoices + aging + balance. */
export async function generateStatementPdf(bpId: string, now: Date): Promise<GeneratedPdf | null> {
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId) });
  if (!bp) return null;
  const ar = await getCreditAR(bpId, now);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  const M = 50;
  let y = 792 - M;
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  const text = (s: string, x: number, size = 10, f = font, color = dark) => page.drawText(s, { x, y, size, font: f, color });
  const ensure = (needed: number) => { if (y - needed < M) { page = doc.addPage([612, 792]); y = 792 - M; } };

  text("STATEMENT", M, 22, bold);
  text("MakeReady by G54", 612 - M - 140, 12, bold, gray);
  y -= 16;
  text("Great Mountain West · Commercial Print & Production", 612 - M - 260, 9, font, gray);
  y -= 28;
  text(bp.companyName, M, 12, bold);
  text(`Statement date: ${fmtDate(now)}`, 612 - M - 160, 10, font, gray);
  y -= 24;

  // Open invoices
  const cols = { num: M, issued: 160, due: 260, aging: 360, total: 440, bal: 520 };
  page.drawRectangle({ x: M - 4, y: y - 4, width: 612 - 2 * M + 8, height: 18, color: rgb(0.94, 0.94, 0.94) });
  text("Invoice", cols.num, 9, bold);
  text("Issued", cols.issued, 9, bold);
  text("Due", cols.due, 9, bold);
  text("Aging", cols.aging, 9, bold);
  text("Total", cols.total, 9, bold);
  text("Balance", cols.bal, 9, bold);
  y -= 22;

  for (const i of ar.openInvoices) {
    ensure(15);
    text(i.invoiceNumber, cols.num, 9);
    text(i.issueDate ? fmtDate(i.issueDate) : "—", cols.issued, 9);
    text(i.dueDate ? fmtDate(i.dueDate) : "—", cols.due, 9);
    text(i.bucket, cols.aging, 9, font, i.bucket === "90+" ? rgb(0.7, 0.1, 0.1) : gray);
    text(money(i.total), cols.total, 9);
    text(money(i.balance), cols.bal, 9);
    y -= 15;
  }
  if (ar.openInvoices.length === 0) { text("No open invoices — account is current.", cols.num, 10, font, gray); y -= 15; }

  // Aging summary
  y -= 16;
  ensure(30);
  text("Aging Summary", M, 10, bold);
  y -= 16;
  const parts = ar.agingBuckets.map((b) => `${b}: ${money(ar.aging[b])}`);
  text(parts.join("    "), M, 9, font, gray);
  y -= 22;

  ensure(20);
  text("Total Balance Due", cols.total - 60, 12, bold);
  text(money(ar.totalAR), cols.bal, 12, bold);

  const bytes = await doc.save();
  return { bytes, base64: Buffer.from(bytes).toString("base64"), filename: `statement-${bp.bpNumber}.pdf` };
}
