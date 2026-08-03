import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { invoices, invoiceLines, businessPartners, contacts } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { invoicePaid } from "./ar";

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface GeneratedPdf {
  bytes: Uint8Array;
  filename: string;
  base64: string;
}

/** Render an invoice PDF (header, bill-to, lines, totals, balance due). */
export async function generateInvoicePdf(invoiceId: string): Promise<GeneratedPdf | null> {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) return null;
  const [bp, contact, lines, paid] = await Promise.all([
    inv.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, inv.bpId) }) : Promise.resolve(undefined),
    inv.bpId ? db.query.contacts.findFirst({ where: and(eq(contacts.bpId, inv.bpId), eq(contacts.isPrimary, true)) }) : Promise.resolve(undefined),
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId)).orderBy(asc(invoiceLines.sortOrder)),
    invoicePaid(invoiceId),
  ]);
  const balance = Number(inv.total) - paid;

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

  // Header
  text("INVOICE", M, 22, bold);
  text("MakeReady by G54", 612 - M - 140, 12, bold, gray);
  y -= 16;
  text("Great Mountain West · Commercial Print & Production", 612 - M - 260, 9, font, gray);
  y -= 28;

  text(`Invoice #: ${inv.invoiceNumber}`, M, 11, bold);
  text(inv.status.toUpperCase(), 612 - M - 60, 11, bold, inv.status === "paid" ? rgb(0.1, 0.5, 0.2) : gray);
  y -= 15;
  if (inv.issueDate) { text(`Issued: ${fmtDate(inv.issueDate)}`, M, 10, font, gray); y -= 13; }
  if (inv.dueDate) { text(`Due: ${fmtDate(inv.dueDate)}`, M, 10, font, gray); y -= 13; }
  if (inv.terms) { text(`Terms: ${inv.terms}`, M, 10, font, gray); y -= 13; }
  y -= 12;

  // Bill to
  text("Bill To", M, 9, bold, gray);
  y -= 14;
  text(bp?.companyName ?? "—", M, 11, bold);
  y -= 14;
  if (contact) { text([contact.firstName, contact.lastName].filter(Boolean).join(" "), M, 10, font, gray); y -= 12; }
  const addr = [bp?.addressStreet, [bp?.addressCity, bp?.addressState, bp?.addressZip].filter(Boolean).join(", ")].filter(Boolean);
  for (const a of addr) { text(a!, M, 10, font, gray); y -= 12; }
  y -= 14;

  // Lines table
  const cols = { desc: M, qty: 360, unit: 430, ext: 510 };
  page.drawRectangle({ x: M - 4, y: y - 4, width: 612 - 2 * M + 8, height: 18, color: rgb(0.94, 0.94, 0.94) });
  text("Description", cols.desc, 9, bold);
  text("Qty", cols.qty, 9, bold);
  text("Unit", cols.unit, 9, bold);
  text("Amount", cols.ext, 9, bold);
  y -= 22;
  for (const l of lines) {
    ensure(16);
    text(l.description.slice(0, 60), cols.desc, 10);
    text(String(l.qty), cols.qty, 10);
    text(money(Number(l.unitPrice)), cols.unit, 10);
    text(money(Number(l.extended)), cols.ext, 10);
    y -= 16;
  }
  if (lines.length === 0) { text("(no line items)", cols.desc, 10, font, gray); y -= 16; }

  // Totals
  y -= 12;
  const totalsX = 430;
  const row = (label: string, val: string, b = false, color = dark) => {
    ensure(15);
    text(label, totalsX, 10, b ? bold : font, color);
    text(val, cols.ext, 10, b ? bold : font, color);
    y -= 15;
  };
  row("Subtotal", money(Number(inv.subtotal)));
  if (Number(inv.discount)) row("Discount", `-${money(Number(inv.discount))}`);
  row("Total", money(Number(inv.total)), true);
  if (paid > 0) row("Paid", `-${money(paid)}`, false, rgb(0.1, 0.5, 0.2));
  row("Balance Due", money(balance), true);

  if (inv.notes) {
    y -= 16;
    ensure(20);
    text("Notes", M, 9, bold, gray);
    y -= 13;
    text(inv.notes.slice(0, 90), M, 9, font, gray);
    y -= 14;
  }

  y -= 20;
  ensure(20);
  text("Please remit payment by the due date. Thank you for your business.", M, 9, font, gray);

  const bytes = await doc.save();
  return { bytes, base64: Buffer.from(bytes).toString("base64"), filename: `${inv.invoiceNumber}.pdf` };
}
