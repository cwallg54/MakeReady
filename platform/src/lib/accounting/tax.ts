import "server-only";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, creditMemos, invoices, taxCodes } from "@/db/schema";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TaxJurisdictionRow {
  code: string;
  name: string;
  state: string | null;
  rate: number;
  taxableSales: number;
  exemptSales: number;
  taxCollected: number;
  creditsTax: number;
  netTaxDue: number;
  invoices: number;
}

export interface TaxFiling {
  from: string;
  to: string;
  rows: TaxJurisdictionRow[];
  totals: { taxableSales: number; exemptSales: number; taxCollected: number; creditsTax: number; netTaxDue: number; invoices: number };
  untaxed: { sales: number; invoices: number };
}

/** Sales-tax return worksheet: taxable sales, exempt sales and tax collected
 *  per state for a period, net of credit memos raised in the same period.
 *  This is the sheet a return is typed from. */
export async function taxFiling(from: Date, to: Date): Promise<TaxFiling> {
  const rows = await db
    .select({
      id: taxCodes.id,
      code: taxCodes.code,
      name: taxCodes.name,
      state: taxCodes.state,
      rate: taxCodes.rate,
      exempt: taxCodes.exempt,
      taxable: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.tax} > 0 THEN ${invoices.subtotal} - ${invoices.discount} ELSE 0 END), 0)`,
      exemptSales: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.tax} <= 0 THEN ${invoices.subtotal} - ${invoices.discount} ELSE 0 END), 0)`,
      tax: sql<string>`COALESCE(SUM(${invoices.tax}), 0)`,
      n: sql<string>`COUNT(${invoices.id})`,
    })
    .from(taxCodes)
    .leftJoin(
      invoices,
      and(
        eq(invoices.taxCodeId, taxCodes.id),
        isNull(invoices.voidedAt),
        sql`${invoices.status} <> 'draft'`,
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    )
    .groupBy(taxCodes.id, taxCodes.code, taxCodes.name, taxCodes.state, taxCodes.rate, taxCodes.exempt, taxCodes.sortOrder)
    .orderBy(asc(taxCodes.sortOrder));

  // Credit memos reduce the tax remitted for the period they are raised in.
  const credits = await db
    .select({
      taxCodeId: invoices.taxCodeId,
      tax: sql<string>`COALESCE(SUM(${creditMemos.tax}), 0)`,
    })
    .from(creditMemos)
    .leftJoin(invoices, eq(invoices.id, creditMemos.invoiceId))
    .where(and(isNull(creditMemos.voidedAt), sql`${creditMemos.status} <> 'draft'`, gte(creditMemos.issueDate, from), lte(creditMemos.issueDate, to)))
    .groupBy(invoices.taxCodeId);
  const creditByCode = new Map(credits.map((c) => [c.taxCodeId, Number(c.tax)]));

  const out: TaxJurisdictionRow[] = rows.map((r) => {
    const taxCollected = round2(Number(r.tax));
    const creditsTax = round2(creditByCode.get(r.id) ?? 0);
    return {
      code: r.code,
      name: r.name,
      state: r.state,
      rate: Number(r.rate),
      taxableSales: round2(Number(r.taxable)),
      exemptSales: round2(Number(r.exemptSales)),
      taxCollected,
      creditsTax,
      netTaxDue: round2(taxCollected - creditsTax),
      invoices: Number(r.n),
    };
  });

  // Anything invoiced with no jurisdiction at all — worth seeing, because it is
  // either genuinely out of nexus or a customer whose tax code was never set.
  const [untaxed] = await db
    .select({
      sales: sql<string>`COALESCE(SUM(${invoices.subtotal} - ${invoices.discount}), 0)`,
      n: sql<string>`COUNT(*)`,
    })
    .from(invoices)
    .where(and(isNull(invoices.taxCodeId), isNull(invoices.voidedAt), sql`${invoices.status} <> 'draft'`, gte(invoices.issueDate, from), lte(invoices.issueDate, to)));

  const sum = (pick: (r: TaxJurisdictionRow) => number) => round2(out.reduce((s, r) => s + pick(r), 0));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    rows: out,
    totals: {
      taxableSales: sum((r) => r.taxableSales),
      exemptSales: sum((r) => r.exemptSales),
      taxCollected: sum((r) => r.taxCollected),
      creditsTax: sum((r) => r.creditsTax),
      netTaxDue: sum((r) => r.netTaxDue),
      invoices: out.reduce((s, r) => s + r.invoices, 0),
    },
    untaxed: { sales: round2(Number(untaxed?.sales ?? 0)), invoices: Number(untaxed?.n ?? 0) },
  };
}

/** Every jurisdiction with its customer count — the nexus footprint. */
export async function taxCodeList() {
  const rows = await db
    .select({
      id: taxCodes.id,
      code: taxCodes.code,
      name: taxCodes.name,
      state: taxCodes.state,
      rate: taxCodes.rate,
      exempt: taxCodes.exempt,
      active: taxCodes.active,
      customers: sql<string>`(SELECT COUNT(*) FROM business_partners b WHERE b.tax_code_id = "tax_codes"."id")`,
    })
    .from(taxCodes)
    .orderBy(asc(taxCodes.sortOrder));
  return rows.map((r) => ({ ...r, rate: Number(r.rate), customers: Number(r.customers) }));
}

/** Customers holding an exemption certificate, and whether it has lapsed. */
export async function exemptCustomers() {
  const rows = await db
    .select({
      id: businessPartners.id,
      name: businessPartners.companyName,
      state: businessPartners.addressState,
      certificate: businessPartners.taxExemptCertificate,
      expires: businessPartners.taxExemptExpires,
    })
    .from(businessPartners)
    .where(eq(businessPartners.taxExempt, true))
    .orderBy(asc(businessPartners.companyName));

  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => ({ ...r, expired: !!r.expires && r.expires < today }));
}

/** The rate to charge a customer, and why. */
export async function rateForCustomer(bpId: string): Promise<{ rate: number; code: string | null; reason: string }> {
  const bp = await db.query.businessPartners.findFirst({
    where: eq(businessPartners.id, bpId),
    columns: { taxCodeId: true, taxExempt: true, addressState: true },
  });
  if (!bp) return { rate: 0, code: null, reason: "Customer not found" };
  if (bp.taxExempt) return { rate: 0, code: "EX", reason: "Exemption certificate on file" };
  if (!bp.taxCodeId) return { rate: 0, code: null, reason: `No nexus in ${bp.addressState ?? "that state"}` };

  const code = await db.query.taxCodes.findFirst({ where: eq(taxCodes.id, bp.taxCodeId) });
  if (!code || !code.active) return { rate: 0, code: null, reason: "Jurisdiction not active" };
  return { rate: Number(code.rate), code: code.code, reason: `${code.name} state rate` };
}
