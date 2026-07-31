import "server-only";
import { and, asc, desc, eq, gte, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { orders, historicalOrders, businessPartners, users, contacts, bpAddresses, activities, accountGroups } from "@/db/schema";
import { fiscalYearOf, fiscalMonthIndex } from "./standard";

// ---------------------------------------------------------------------------
// Sales Analysis by Salesperson & Customer
//
// A 3-fiscal-year (Oct–Sep) monthly comparison. Sales are recognised on the
// order date. We union the live operational orders with the migrated historical
// order headers so the report is meaningful today; both are attributed to the
// account's current owner as "salesperson" (historical rows carry no rep).
// ---------------------------------------------------------------------------

export interface SalesYearRow {
  months: number[]; // 12 fiscal months, Oct-first
  threeMo: number; // Oct+Nov+Dec
  total: number;
}
export interface SalesCustomer {
  bpId: string;
  code: string; // legacy code / BP number
  name: string;
  terms: string;
  current: SalesYearRow;
  prior: SalesYearRow;
  twoAgo: SalesYearRow;
}
export interface SalesRepGroup {
  repId: string;
  repName: string;
  customers: SalesCustomer[];
  totals: { current: number; prior: number; twoAgo: number };
}

const emptyYear = (): SalesYearRow => ({ months: Array(12).fill(0), threeMo: 0, total: 0 });

export async function getSalesAnalysis(fiscalYear: number): Promise<{ groups: SalesRepGroup[]; fiscalYear: number }> {
  const years = [fiscalYear, fiscalYear - 1, fiscalYear - 2];
  // Earliest date we care about: Oct 1 of the calendar year before the oldest FY.
  const earliest = new Date(Date.UTC(fiscalYear - 3, 9, 1)); // (fy-2) starts Oct (fy-3)

  const [liveRows, histRows, repRows] = await Promise.all([
    db
      .select({
        amount: orders.amount,
        date: orders.createdAt,
        salesRepId: orders.salesRepId,
        bpId: businessPartners.id,
        ownerId: businessPartners.ownerId,
        code: businessPartners.legacyCode,
        bpNumber: businessPartners.bpNumber,
        name: businessPartners.companyName,
        terms: businessPartners.paymentTerms,
      })
      .from(orders)
      .innerJoin(businessPartners, eq(orders.bpId, businessPartners.id))
      .where(and(isNull(orders.voidedAt), gte(orders.createdAt, earliest))),
    db
      .select({
        amount: historicalOrders.docTotal,
        date: historicalOrders.docDate,
        bpId: businessPartners.id,
        ownerId: businessPartners.ownerId,
        code: businessPartners.legacyCode,
        bpNumber: businessPartners.bpNumber,
        name: businessPartners.companyName,
        terms: businessPartners.paymentTerms,
      })
      .from(historicalOrders)
      .innerJoin(businessPartners, eq(historicalOrders.bpId, businessPartners.id))
      .where(and(eq(historicalOrders.canceled, false), gte(historicalOrders.docDate, earliest))),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);

  const repName = new Map(repRows.map((r) => [r.id, r.name]));

  // rep -> customer -> customer aggregate
  const reps = new Map<string, Map<string, SalesCustomer>>();

  const add = (
    repId: string | null,
    bpId: string,
    code: string | null,
    name: string,
    terms: string | null,
    amount: number,
    date: Date,
  ) => {
    const fy = fiscalYearOf(date);
    const yi = years.indexOf(fy);
    if (yi === -1) return;
    const rid = repId ?? "unassigned";
    let custs = reps.get(rid);
    if (!custs) reps.set(rid, (custs = new Map()));
    let c = custs.get(bpId);
    if (!c) {
      custs.set(bpId, (c = { bpId, code: code ?? "", name, terms: terms ?? "", current: emptyYear(), prior: emptyYear(), twoAgo: emptyYear() }));
    }
    const row = yi === 0 ? c.current : yi === 1 ? c.prior : c.twoAgo;
    const mi = fiscalMonthIndex(date);
    row.months[mi] += amount;
    row.total += amount;
    if (mi <= 2) row.threeMo += amount;
  };

  for (const r of liveRows) add(r.salesRepId ?? r.ownerId, r.bpId, r.code, r.name, r.terms, Number(r.amount), r.date);
  for (const r of histRows) add(r.ownerId, r.bpId, r.code, r.name, r.terms, Number(r.amount), r.date);

  const groups: SalesRepGroup[] = [];
  for (const [rid, custs] of reps) {
    const customers = [...custs.values()].sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
    const totals = customers.reduce(
      (acc, c) => ({ current: acc.current + c.current.total, prior: acc.prior + c.prior.total, twoAgo: acc.twoAgo + c.twoAgo.total }),
      { current: 0, prior: 0, twoAgo: 0 },
    );
    groups.push({ repId: rid, repName: rid === "unassigned" ? "Unassigned" : repName.get(rid) ?? "Unknown", customers, totals });
  }
  groups.sort((a, b) => a.repName.localeCompare(b.repName));
  return { groups, fiscalYear };
}

// ---------------------------------------------------------------------------
// Open orders (shared by the two Open Orders reports)
// ---------------------------------------------------------------------------

export interface OpenOrderRow {
  id: string;
  orderNumber: string;
  orderType: string | null;
  poNumber: string | null;
  shipVia: string | null;
  dateType: string;
  dueDate: Date | null;
  enteredDate: Date;
  amount: number;
  bpId: string | null;
  code: string | null;
  customer: string;
  territory: string | null;
  repId: string | null;
  repName: string;
}

export async function getOpenOrders(): Promise<OpenOrderRow[]> {
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      poNumber: orders.poNumber,
      shipVia: orders.shipVia,
      dateType: orders.dateType,
      dueDate: orders.dueDate,
      inHands: orders.inHandsDate,
      enteredDate: orders.createdAt,
      amount: orders.amount,
      bpId: businessPartners.id,
      code: businessPartners.legacyCode,
      customer: businessPartners.companyName,
      territory: businessPartners.territory,
      salesRepId: orders.salesRepId,
      ownerId: businessPartners.ownerId,
      repName: users.name,
    })
    .from(orders)
    .leftJoin(businessPartners, eq(orders.bpId, businessPartners.id))
    .leftJoin(users, eq(orders.salesRepId, users.id))
    // Open = not delivered and not voided.
    .where(and(isNull(orders.voidedAt), ne(orders.stage, "delivered")))
    .orderBy(asc(orders.dueDate));

  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    orderType: r.orderType,
    poNumber: r.poNumber,
    shipVia: r.shipVia,
    dateType: r.dateType,
    dueDate: r.dueDate ?? r.inHands ?? null,
    enteredDate: r.enteredDate,
    amount: Number(r.amount),
    bpId: r.bpId,
    code: r.code,
    customer: r.customer ?? "No customer",
    territory: r.territory,
    repId: r.salesRepId ?? r.ownerId,
    repName: r.repName ?? "Unassigned",
  }));
}

// ---------------------------------------------------------------------------
// Customer Credit Report (CCR)
// ---------------------------------------------------------------------------

export interface CreditOpenOrder {
  id: string;
  orderNumber: string;
  orderType: string | null;
  poNumber: string | null;
  enteredDate: Date;
  dueDate: Date | null;
  dateType: string;
  amount: number;
}
export interface CreditActivity { id: string; date: Date; author: string; content: string }

export async function getCreditData(bpId: string, now: Date) {
  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, bpId) });
  if (!bp) return null;

  const [contact, billing, group, rep, openOrderRows, histRows, liveSalesRows, activityRows] = await Promise.all([
    db.query.contacts.findFirst({ where: and(eq(contacts.bpId, bpId), eq(contacts.isPrimary, true)) }),
    db.query.bpAddresses.findFirst({ where: and(eq(bpAddresses.bpId, bpId), eq(bpAddresses.type, "billing")) }),
    bp.accountGroupId ? db.query.accountGroups.findFirst({ where: eq(accountGroups.id, bp.accountGroupId) }) : Promise.resolve(undefined),
    bp.ownerId ? db.query.users.findFirst({ where: eq(users.id, bp.ownerId), columns: { name: true } }) : Promise.resolve(undefined),
    db.select({ id: orders.id, orderNumber: orders.orderNumber, orderType: orders.orderType, poNumber: orders.poNumber, enteredDate: orders.createdAt, dueDate: orders.dueDate, inHands: orders.inHandsDate, dateType: orders.dateType, amount: orders.amount })
      .from(orders).where(and(eq(orders.bpId, bpId), isNull(orders.voidedAt), ne(orders.stage, "delivered"))).orderBy(asc(orders.dueDate)),
    db.select({ amount: historicalOrders.docTotal, date: historicalOrders.docDate }).from(historicalOrders).where(and(eq(historicalOrders.bpId, bpId), eq(historicalOrders.canceled, false))),
    db.select({ amount: orders.amount, date: orders.createdAt }).from(orders).where(and(eq(orders.bpId, bpId), isNull(orders.voidedAt))),
    db.select({ id: activities.id, date: activities.createdAt, content: activities.content, author: users.name }).from(activities).leftJoin(users, eq(activities.userId, users.id)).where(eq(activities.bpId, bpId)).orderBy(desc(activities.createdAt)).limit(30),
  ]);

  // Trailing-12-month sales buckets: [0-12), [12-24), [24-36) months back.
  const buckets = [0, 0, 0];
  const monthsAgo = (d: Date) => (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  for (const r of [...histRows, ...liveSalesRows]) {
    const m = monthsAgo(r.date);
    if (m >= 0 && m < 12) buckets[0] += Number(r.amount);
    else if (m < 24) buckets[1] += Number(r.amount);
    else if (m < 36) buckets[2] += Number(r.amount);
  }

  const openOrders: CreditOpenOrder[] = openOrderRows.map((r) => ({
    id: r.id, orderNumber: r.orderNumber, orderType: r.orderType, poNumber: r.poNumber,
    enteredDate: r.enteredDate, dueDate: r.dueDate ?? r.inHands ?? null, dateType: r.dateType, amount: Number(r.amount),
  }));
  const activity: CreditActivity[] = activityRows.map((r) => ({ id: r.id, date: r.date, author: r.author ?? "System", content: r.content }));

  return {
    bp,
    contactName: contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") : null,
    billing,
    groupName: group?.name ?? null,
    repName: rep?.name ?? null,
    salesBuckets: buckets,
    openOrders,
    openOrdersTotal: openOrders.reduce((s, o) => s + o.amount, 0),
    activity,
  };
}
