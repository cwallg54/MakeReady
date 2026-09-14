import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners, invoices, paymentTermsTable } from "@/db/schema";

/** The day past due at which an account gets chased. Finance works a 15-day
 *  list: everything that slipped past terms two weeks ago, before it ages. */
export const CHASE_DAY = 15;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface OpenItem {
  id: string;
  invoiceNumber: string;
  bpId: string | null;
  customer: string;
  parentId: string | null;
  parentName: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  total: number;
  applied: number;
  balance: number;
  daysPastDue: number;
  termsName: string | null;
  cardOnFile: boolean;
  prepay: boolean;
  creditAllowed: boolean;
  cardChargedAt: Date | null;
  cardChargeNote: string | null;
}

/** Every open AR item with its customer, terms and age. One query, reused by
 *  all the worklists below rather than repeating the join five times. */
export async function openItems(asOf = new Date()): Promise<OpenItem[]> {
  const parent = db.$with("parent");
  void parent; // (kept simple: parent resolved with a correlated select below)

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      bpId: invoices.bpId,
      customer: businessPartners.companyName,
      parentId: businessPartners.parentBpId,
      parentName: sql<string | null>`(SELECT p.company_name FROM business_partners p WHERE p.id = "business_partners"."parent_bp_id")`,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      total: invoices.total,
      applied: sql<string>`COALESCE((SELECT SUM(a.amount) FROM ar_applications a WHERE a.invoice_id = "invoices"."id"), 0)`,
      termsName: paymentTermsTable.name,
      cardOnFile: paymentTermsTable.cardOnFile,
      prepay: paymentTermsTable.prepay,
      creditAllowed: paymentTermsTable.creditAllowed,
      cardChargedAt: invoices.cardChargedAt,
      cardChargeNote: invoices.cardChargeNote,
    })
    .from(invoices)
    .leftJoin(businessPartners, eq(businessPartners.id, invoices.bpId))
    .leftJoin(
      paymentTermsTable,
      sql`${paymentTermsTable.id} = COALESCE(${invoices.termsId}, ${businessPartners.termsId})`,
    )
    .where(and(isNull(invoices.voidedAt), sql`${invoices.status} <> 'draft'`))
    .orderBy(asc(invoices.dueDate));

  const day = 86_400_000;
  return rows
    .map((r) => {
      const total = Number(r.total);
      const applied = Number(r.applied);
      const balance = round2(total - applied);
      const daysPastDue = r.dueDate ? Math.floor((asOf.getTime() - r.dueDate.getTime()) / day) : 0;
      return {
        ...r,
        customer: r.customer ?? "—",
        total,
        applied,
        balance,
        daysPastDue,
        cardOnFile: !!r.cardOnFile,
        prepay: !!r.prepay,
        creditAllowed: r.creditAllowed ?? true,
      };
    })
    .filter((r) => r.balance > 0.005);
}

export interface CollectionsQueues {
  chase: OpenItem[]; // hit the chase day exactly — today's call list
  overdue: OpenItem[]; // anything past due
  cardsDueToday: OpenItem[]; // card on file, due today — run the card
  cardsPastDue: OpenItem[]; // card on file, already past due
  prepayOutstanding: OpenItem[]; // must be collected before it ships
  noCredit: OpenItem[]; // account is on stop
  totals: { open: number; overdue: number; cards: number; prepay: number };
}

/** The five worklists the AR desk actually works, built from one pass. */
export async function collectionsQueues(asOf = new Date()): Promise<CollectionsQueues> {
  const items = await openItems(asOf);

  const overdue = items.filter((i) => i.daysPastDue > 0);
  const chase = overdue.filter((i) => i.daysPastDue >= CHASE_DAY && i.daysPastDue < CHASE_DAY + 15 && !i.cardOnFile);
  const cardsDueToday = items.filter((i) => i.cardOnFile && i.daysPastDue === 0 && !i.cardChargedAt);
  const cardsPastDue = items.filter((i) => i.cardOnFile && i.daysPastDue > 0 && !i.cardChargedAt);
  const prepayOutstanding = items.filter((i) => i.prepay);
  const noCredit = items.filter((i) => !i.creditAllowed);

  const sum = (rows: OpenItem[]) => round2(rows.reduce((s, r) => s + r.balance, 0));

  return {
    chase,
    overdue,
    cardsDueToday,
    cardsPastDue,
    prepayOutstanding,
    noCredit,
    totals: {
      open: sum(items),
      overdue: sum(overdue),
      cards: sum([...cardsDueToday, ...cardsPastDue]),
      prepay: sum(prepayOutstanding),
    },
  };
}

export interface ParentRollup {
  id: string;
  name: string;
  children: number;
  open: number;
  overdue: number;
  oldestDays: number;
}

/** Roll open AR up to the parent account. Child accounts bill in their own
 *  name but are chased, statemented and settled at the parent. */
export async function parentRollup(asOf = new Date()): Promise<ParentRollup[]> {
  const items = await openItems(asOf);
  const map = new Map<string, ParentRollup & { kids: Set<string> }>();

  for (const i of items) {
    const key = i.parentId ?? i.bpId;
    if (!key) continue;
    const name = i.parentId ? i.parentName ?? "—" : i.customer;
    let row = map.get(key);
    if (!row) map.set(key, (row = { id: key, name, children: 0, open: 0, overdue: 0, oldestDays: 0, kids: new Set() }));
    if (i.bpId) row.kids.add(i.bpId);
    row.open = round2(row.open + i.balance);
    if (i.daysPastDue > 0) row.overdue = round2(row.overdue + i.balance);
    row.oldestDays = Math.max(row.oldestDays, i.daysPastDue);
  }

  return [...map.values()]
    .map(({ kids, ...r }) => ({ ...r, children: kids.size }))
    .sort((a, b) => b.open - a.open);
}
