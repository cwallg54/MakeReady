import "server-only";
import { asc, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { orders, quotes, quoteLines, quoteCharges, businessPartners, contacts } from "@/db/schema";
import { and } from "drizzle-orm";

const money = (n: number) => `$${n.toFixed(2)}`;

export interface GeneratedPdf {
  bytes: Uint8Array;
  filename: string;
  base64: string;
}

/** Render a sales-order PDF for an order (pulls line items from the source quote). */
export async function generateOrderPdf(orderId: string): Promise<GeneratedPdf | null> {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return null;
  const [bp, quote] = await Promise.all([
    order.bpId ? db.query.businessPartners.findFirst({ where: eq(businessPartners.id, order.bpId) }) : Promise.resolve(undefined),
    order.quoteId ? db.query.quotes.findFirst({ where: eq(quotes.id, order.quoteId) }) : Promise.resolve(undefined),
  ]);
  const lines = quote ? await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id)).orderBy(asc(quoteLines.sortOrder)) : [];
  const charges = quote ? await db.select().from(quoteCharges).where(eq(quoteCharges.quoteId, quote.id)) : [];
  const contact = order.bpId ? await db.query.contacts.findFirst({ where: and(eq(contacts.bpId, order.bpId), eq(contacts.isPrimary, true)) }) : undefined;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  const M = 50;
  let y = 792 - M;
  const dark = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);

  const text = (s: string, x: number, size = 10, f = font, color = dark) => page.drawText(s, { x, y, size, font: f, color });
  const ensure = (needed: number) => {
    if (y - needed < M) { page = doc.addPage([612, 792]); y = 792 - M; }
  };

  // Header
  text("SALES ORDER", M, 22, bold);
  text("MakeReady by G54", 612 - M - 140, 12, bold, gray);
  y -= 16;
  text("Great Mountain West · Commercial Print & Production", 612 - M - 260, 9, font, gray);
  y -= 28;

  text(`Order #: ${order.orderNumber}`, M, 11, bold);
  y -= 15;
  text(`Date: ${new Date().toLocaleDateString("en-US")}`, M, 10, font, gray);
  y -= 24;

  // Bill to
  text("Customer", M, 9, bold, gray);
  y -= 14;
  text(bp?.companyName ?? "—", M, 11, bold);
  y -= 14;
  if (contact) { text([contact.firstName, contact.lastName].filter(Boolean).join(" "), M, 10, font, gray); y -= 12; }
  if (bp?.email || contact?.email) { text(contact?.email ?? bp?.email ?? "", M, 10, font, gray); y -= 12; }
  y -= 14;

  // Table header
  const cols = { desc: M, qty: 360, unit: 430, ext: 510 };
  page.drawRectangle({ x: M - 4, y: y - 4, width: 612 - 2 * M + 8, height: 18, color: rgb(0.94, 0.94, 0.94) });
  text("Description", cols.desc, 9, bold);
  text("Qty", cols.qty, 9, bold);
  text("Unit", cols.unit, 9, bold);
  text("Ext.", cols.ext, 9, bold);
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

  if (charges.length) {
    y -= 8;
    text("Charges", M, 9, bold, gray);
    y -= 15;
    for (const c of charges) {
      ensure(14);
      text(c.label.slice(0, 60), cols.desc, 10);
      text(money(Number(c.amount)), cols.ext, 10);
      y -= 14;
    }
  }

  // Totals
  y -= 12;
  const totalsX = 430;
  const row = (label: string, val: string, b = false) => {
    ensure(14);
    text(label, totalsX, 10, b ? bold : font);
    text(val, cols.ext, 10, b ? bold : font);
    y -= 15;
  };
  if (quote) {
    row("Subtotal", money(Number(quote.subtotal)));
    row("Charges", money(Number(quote.chargesTotal)));
    if (Number(quote.discount)) row("Discount", `-${money(Number(quote.discount))}`);
    row("Total", money(Number(quote.total)), true);
  }

  y -= 24;
  ensure(20);
  text("Thank you for your business. Questions? Contact Great Mountain West.", M, 9, font, gray);

  const bytes = await doc.save();
  const base64 = Buffer.from(bytes).toString("base64");
  return { bytes, base64, filename: `${order.orderNumber}.pdf` };
}
