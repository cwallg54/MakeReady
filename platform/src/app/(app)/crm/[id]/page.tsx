import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, canView, canSeeBpFinance, crmScopedToOwn } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners, accountGroups, contacts, activities, users, bpAddresses, crmTasks, customerDocuments, schedulingProfiles, orders, quotes } from "@/db/schema";
import { FinancialDocs } from "@/components/crm/financial-docs";
import { getAssignableUsers } from "@/lib/crm/users";
import { PageHeader, Card } from "@/components/ui";
import { ContactsManager } from "@/components/crm/contacts-manager";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ConfirmButton } from "@/components/confirm-button";
import {
  addActivityAction,
  setStageAction,
  setOwnerAction,
  addTaskAction,
  setTaskStatusAction,
  addAddressAction,
  deleteAddressAction,
} from "@/lib/crm/actions";
import { BpEditForm } from "./bp-edit-form";

const WEB_STORE_LABEL: Record<string, string> = { not_published: "Not published", pending: "Pending", published: "Published" };
const ACTIVITY_LABEL: Record<string, string> = { note: "Note", call: "Call", email: "Email", visit: "Visit", other: "Other" };
const STAGE_LABEL: Record<string, string> = { lead: "Lead", prospect: "Prospect", customer: "Customer" };
const STAGE_BADGE: Record<string, string> = {
  lead: "bg-amber-100 text-amber-700",
  prospect: "bg-blue-100 text-blue-700",
  customer: "bg-emerald-100 text-emerald-700",
};
const ORDER_STAGE_LABEL: Record<string, string> = { received: "Received", art_proof: "Art proof", production: "Production", quality: "Quality", shipped: "Shipped", delivered: "Delivered" };
const ORDER_STAGE_BADGE: Record<string, string> = {
  received: "bg-neutral-100 text-neutral-700",
  art_proof: "bg-purple-100 text-purple-700",
  production: "bg-blue-100 text-blue-700",
  quality: "bg-amber-100 text-amber-700",
  shipped: "bg-sky-100 text-sky-700",
  delivered: "bg-emerald-100 text-emerald-700",
};
const input = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

export default async function BpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("crm");
  const { id } = await params;
  const editable = canEdit(user.roles, "crm");
  const showFinance = canSeeBpFinance(user.roles);
  const scoped = crmScopedToOwn(user.roles);

  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, id) });
  if (!bp) notFound();
  // Sales Reps may only open their own accounts.
  if (scoped && bp.ownerId !== user.id) redirect("/403");

  const [group, owner, contactRows, activityRows, addressRows, taskRows, groups, owners, orderRows] = await Promise.all([
    bp.accountGroupId ? db.query.accountGroups.findFirst({ where: eq(accountGroups.id, bp.accountGroupId) }) : Promise.resolve(undefined),
    bp.ownerId ? db.query.users.findFirst({ where: eq(users.id, bp.ownerId) }) : Promise.resolve(undefined),
    db.select().from(contacts).where(eq(contacts.bpId, id)).orderBy(desc(contacts.isPrimary)),
    db
      .select({ id: activities.id, type: activities.type, content: activities.content, isSystem: activities.isSystem, createdAt: activities.createdAt, author: users.name })
      .from(activities)
      .leftJoin(users, eq(activities.userId, users.id))
      .where(eq(activities.bpId, id))
      .orderBy(desc(activities.createdAt)),
    db.select().from(bpAddresses).where(eq(bpAddresses.bpId, id)),
    db
      .select({ id: crmTasks.id, title: crmTasks.title, dueDate: crmTasks.dueDate, status: crmTasks.status, assignee: users.name })
      .from(crmTasks)
      .leftJoin(users, eq(crmTasks.assignedToId, users.id))
      .where(eq(crmTasks.bpId, id))
      .orderBy(asc(crmTasks.status), asc(crmTasks.dueDate)),
    db.select({ id: accountGroups.id, name: accountGroups.name }).from(accountGroups).orderBy(asc(accountGroups.name)),
    editable && !scoped ? getAssignableUsers() : Promise.resolve([]),
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        stage: orders.stage,
        publicToken: orders.publicToken,
        inHandsDate: orders.inHandsDate,
        voidedAt: orders.voidedAt,
        createdAt: orders.createdAt,
        total: quotes.total,
        quoteNumber: quotes.quoteNumber,
      })
      .from(orders)
      .leftJoin(quotes, eq(orders.quoteId, quotes.id))
      .where(eq(orders.bpId, id))
      .orderBy(desc(orders.createdAt)),
  ]);
  const orderTotal = orderRows.reduce((s, o) => s + (o.voidedAt ? 0 : Number(o.total ?? 0)), 0);
  const liveOrders = orderRows.filter((o) => !o.voidedAt).length;
  // Primary contact drives the mobile tap-to-call / tap-to-email actions.
  const primaryContact = contactRows[0];
  const contactPhone = primaryContact?.phone ?? null;
  const contactEmail = primaryContact?.email ?? null;
  const canSell = canView(user.roles, "sales");
  const docs = await db.select().from(customerDocuments).where(eq(customerDocuments.bpId, id)).orderBy(desc(customerDocuments.createdAt));
  const baseUrl = process.env.APP_URL ?? "https://makeready.g54.com";
  const ownerSchedule = bp.ownerId ? await db.query.schedulingProfiles.findFirst({ where: eq(schedulingProfiles.userId, bp.ownerId) }) : null;

  return (
    <div className="max-w-5xl">
      <Link href="/crm" className="text-sm text-neutral-500 hover:text-neutral-900">← Business Partners</Link>
      <PageHeader
        title={bp.companyName}
        description={`${bp.bpNumber} · ${group?.name ?? "No account group"}${bp.leadSource ? ` · Source: ${bp.leadSource}` : ""} · Web Store: ${WEB_STORE_LABEL[bp.webStoreStatus]}`}
      />

      {/* Stage + owner bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3">
        <span className="text-sm text-neutral-500">Stage:</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STAGE_BADGE[bp.lifecycleStage]}`}>{STAGE_LABEL[bp.lifecycleStage]}</span>
        {editable &&
          (["lead", "prospect", "customer"] as const)
            .filter((s) => s !== bp.lifecycleStage)
            .map((s) => (
              <form key={s} action={setStageAction}>
                <input type="hidden" name="id" value={bp.id} />
                <input type="hidden" name="stage" value={s} />
                <button className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">→ {STAGE_LABEL[s]}</button>
              </form>
            ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-neutral-500">Owner:</span>
          {editable && !scoped ? (
            <form action={setOwnerAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={bp.id} />
              <select name="ownerId" defaultValue={bp.ownerId ?? ""} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900">
                <option value="">Unassigned</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <button className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50">Set</button>
            </form>
          ) : (
            <span className="text-sm font-medium text-neutral-800">{owner?.name ?? "Unassigned"}</span>
          )}
        </div>
      </div>

      {/* Mobile field-sales quick actions */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:hidden">
        <a
          href={contactPhone ? `tel:${contactPhone}` : undefined}
          aria-disabled={!contactPhone}
          className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-semibold ${contactPhone ? "border-neutral-200 bg-white text-neutral-800 active:bg-neutral-50" : "border-neutral-100 bg-neutral-50 text-neutral-300"}`}
        >
          <span className="text-lg">📞</span>Call
        </a>
        <a
          href={contactEmail ? `mailto:${contactEmail}` : undefined}
          aria-disabled={!contactEmail}
          className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-xs font-semibold ${contactEmail ? "border-neutral-200 bg-white text-neutral-800 active:bg-neutral-50" : "border-neutral-100 bg-neutral-50 text-neutral-300"}`}
        >
          <span className="text-lg">✉️</span>Email
        </a>
        <a href="#activity" className="flex flex-col items-center gap-1 rounded-xl border border-neutral-200 bg-white py-3 text-xs font-semibold text-neutral-800 active:bg-neutral-50">
          <span className="text-lg">📝</span>Log
        </a>
        {canSell ? (
          <Link
            href={`/sales/quotes/new?bp=${bp.id}&bpName=${encodeURIComponent(bp.companyName)}`}
            className="flex flex-col items-center gap-1 rounded-xl border border-neutral-900 bg-neutral-900 py-3 text-xs font-semibold text-white active:bg-neutral-700"
          >
            <span className="text-lg">🧾</span>New Quote
          </Link>
        ) : (
          <span className="flex flex-col items-center gap-1 rounded-xl border border-neutral-100 bg-neutral-50 py-3 text-xs font-semibold text-neutral-300">
            <span className="text-lg">🧾</span>New Quote
          </span>
        )}
      </div>

      {ownerSchedule?.active && (
        <div className="mb-6">
          <a href={`${baseUrl}/schedule/${ownerSchedule.slug}`} target="_blank" className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">
            📅 Book a meeting with {owner?.name ?? "the owner"}
          </a>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">Account details</h2>
            {editable ? (
              <BpEditForm
                bp={{
                  id: bp.id,
                  companyName: bp.companyName,
                  lifecycleStage: bp.lifecycleStage,
                  leadSource: bp.leadSource,
                  ownerId: bp.ownerId,
                  tags: bp.tags,
                  accountGroupId: bp.accountGroupId,
                  email: bp.email,
                  phone: bp.phone,
                  addressStreet: bp.addressStreet,
                  addressCity: bp.addressCity,
                  addressState: bp.addressState,
                  addressZip: bp.addressZip,
                  creditLimit: bp.creditLimit,
                  paymentTerms: bp.paymentTerms,
                  internalNotes: bp.internalNotes,
                }}
                groups={groups}
                owners={owners}
                scoped={scoped}
                showFinance={showFinance}
              />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Detail label="Email" value={bp.email} />
                <Detail label="Phone" value={bp.phone} />
                <Detail label="Address" value={[bp.addressStreet, bp.addressCity, bp.addressState, bp.addressZip].filter(Boolean).join(", ")} />
                {showFinance && <Detail label="Credit limit" value={bp.creditLimit} />}
                {showFinance && <Detail label="Payment terms" value={bp.paymentTerms} />}
              </dl>
            )}
          </Card>

          {/* Tasks */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Tasks &amp; follow-ups</h2>
            {editable && (
              <form action={addTaskAction} className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
                <input type="hidden" name="bpId" value={bp.id} />
                <input name="title" required placeholder="Follow up with…" className={input} />
                <input name="dueDate" type="date" className={input} />
                <select name="assignedToId" defaultValue={user.id} className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900">
                  {owners.length === 0 && <option value={user.id}>Me</option>}
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <button className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Add</button>
              </form>
            )}
            <ul className="space-y-2">
              {taskRows.length === 0 && <li className="text-sm text-neutral-400">No tasks.</li>}
              {taskRows.map((t) => {
                const overdue = t.status === "open" && t.dueDate && t.dueDate.getTime() < Date.now();
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {editable && (
                        <form action={setTaskStatusAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="bpId" value={bp.id} />
                          <input type="hidden" name="done" value={t.status === "open" ? "true" : "false"} />
                          <button
                            className={`flex h-4 w-4 items-center justify-center rounded border ${t.status === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-neutral-400"}`}
                            title={t.status === "done" ? "Reopen" : "Complete"}
                          >
                            {t.status === "done" ? "✓" : ""}
                          </button>
                        </form>
                      )}
                      <span className={`text-sm ${t.status === "done" ? "text-neutral-400 line-through" : "text-neutral-800"}`}>{t.title}</span>
                    </div>
                    <span className={`text-xs ${overdue ? "font-medium text-red-600" : "text-neutral-400"}`}>
                      {t.assignee ? `${t.assignee}` : ""}{t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ""}{overdue ? " · overdue" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Activity log */}
          <div id="activity" className="scroll-mt-20" />
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-neutral-900">Activity log</h2>
            <p className="mb-3 text-xs text-neutral-400">Notes and calls you log, plus automatic records of every change to this account.</p>
            {editable && (
              <form action={addActivityAction} className="mb-4 flex gap-2">
                <input type="hidden" name="bpId" value={bp.id} />
                <select name="type" className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm text-neutral-900">
                  {Object.entries(ACTIVITY_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <input name="content" required placeholder="Log a note, call, email, or visit…" className={`flex-1 ${input}`} />
                <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Log</button>
              </form>
            )}
            <ul className="space-y-3">
              {activityRows.length === 0 && <li className="text-sm text-neutral-400">No activity logged yet.</li>}
              {activityRows.map((a) => (
                <li key={a.id} className={`border-l-2 pl-3 ${a.isSystem ? "border-neutral-200" : "border-neutral-900"}`}>
                  <p className={`text-sm ${a.isSystem ? "italic text-neutral-500" : "text-neutral-800"}`}>{a.content}</p>
                  <p className="text-xs text-neutral-400">{a.isSystem ? "Change" : ACTIVITY_LABEL[a.type]} · {a.author ?? "Unknown"} · {fmtDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          </Card>

          {/* Order history */}
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-neutral-900">Order history</h2>
              {orderRows.length > 0 && (
                <span className="text-xs text-neutral-400">{liveOrders} order{liveOrders === 1 ? "" : "s"} · ${orderTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} lifetime</span>
              )}
            </div>
            {orderRows.length === 0 ? (
              <p className="text-sm text-neutral-400">No orders yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-neutral-400">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Order</th>
                      <th className="py-1.5 pr-3 font-medium">Stage</th>
                      <th className="py-1.5 pr-3 font-medium">In-hands</th>
                      <th className="py-1.5 pr-3 font-medium">Placed</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {orderRows.map((o) => (
                      <tr key={o.id} className={o.voidedAt ? "text-neutral-400 line-through" : "text-neutral-700"}>
                        <td className="py-1.5 pr-3 font-medium">
                          <Link href={`/sales/orders/${o.id}`} className="text-neutral-900 hover:underline">{o.orderNumber}</Link>
                        </td>
                        <td className="py-1.5 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STAGE_BADGE[o.stage]}`}>{ORDER_STAGE_LABEL[o.stage]}</span>
                          {o.voidedAt && <span className="ml-1 text-xs">(voided)</span>}
                        </td>
                        <td className="py-1.5 pr-3">{o.inHandsDate ? fmtDate(o.inHandsDate) : "—"}</td>
                        <td className="py-1.5 pr-3">{fmtDate(o.createdAt)}</td>
                        <td className="py-1.5 pr-3 text-right">{o.total != null ? `$${Number(o.total).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Contacts</h2>
            <ContactsManager bpId={bp.id} contacts={contactRows} editable={editable} />
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Addresses</h2>
            <ul className="space-y-3">
              {addressRows.length === 0 && <li className="text-sm text-neutral-400">No addresses.</li>}
              {addressRows.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{a.type}{a.label ? ` · ${a.label}` : ""}</p>
                    <p className="text-sm text-neutral-800">{[a.street, a.city, a.state, a.zip].filter(Boolean).join(", ") || "—"}</p>
                  </div>
                  {editable && (
                    <form action={deleteAddressAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="bpId" value={bp.id} />
                      <ConfirmButton message="Remove this address?" className="text-xs text-red-600 hover:text-red-800">Remove</ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {editable && (
              <form action={addAddressAction} className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
                <input type="hidden" name="bpId" value={bp.id} />
                <div className="grid grid-cols-2 gap-2">
                  <select name="type" className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900">
                    <option value="shipping">Shipping</option>
                    <option value="billing">Billing</option>
                    <option value="other">Other</option>
                  </select>
                  <input name="label" placeholder="Label (optional)" className={input} />
                </div>
                <input name="street" placeholder="Street" className={input} />
                <div className="grid grid-cols-3 gap-2">
                  <input name="city" placeholder="City" className={input} />
                  <input name="state" placeholder="State" className={input} />
                  <input name="zip" placeholder="ZIP" className={input} />
                </div>
                <button className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Add address</button>
              </form>
            )}
          </Card>

          <FinancialDocs
            bpId={bp.id}
            editable={editable}
            baseUrl={baseUrl}
            docs={docs.map((d) => ({ id: d.id, docType: d.docType, token: d.token, status: d.status, createdAt: d.createdAt, submittedAt: d.submittedAt }))}
          />
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="text-neutral-800">{value || "—"}</dd>
    </div>
  );
}
