import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, canSeeBpFinance } from "@/lib/rbac";
import { db } from "@/db";
import { businessPartners, accountGroups, contacts, activities, users } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { addContactAction, deleteContactAction, addActivityAction } from "@/lib/crm/actions";
import { BpEditForm } from "./bp-edit-form";

const WEB_STORE_LABEL: Record<string, string> = {
  not_published: "Not published",
  pending: "Pending",
  published: "Published",
};
const ACTIVITY_LABEL: Record<string, string> = { note: "Note", call: "Call", email: "Email", visit: "Visit", other: "Other" };

export default async function BpDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireModule("crm");
  const { id } = await params;
  const editable = canEdit(user.roles, "crm");
  const showFinance = canSeeBpFinance(user.roles);

  const bp = await db.query.businessPartners.findFirst({ where: eq(businessPartners.id, id) });
  if (!bp) notFound();

  const [group, contactRows, activityRows, groups] = await Promise.all([
    bp.accountGroupId
      ? db.query.accountGroups.findFirst({ where: eq(accountGroups.id, bp.accountGroupId) })
      : Promise.resolve(undefined),
    db.select().from(contacts).where(eq(contacts.bpId, id)).orderBy(desc(contacts.isPrimary)),
    db
      .select({
        id: activities.id,
        type: activities.type,
        content: activities.content,
        createdAt: activities.createdAt,
        author: users.name,
      })
      .from(activities)
      .leftJoin(users, eq(activities.userId, users.id))
      .where(eq(activities.bpId, id))
      .orderBy(desc(activities.createdAt)),
    db.select({ id: accountGroups.id, name: accountGroups.name }).from(accountGroups).orderBy(asc(accountGroups.name)),
  ]);

  return (
    <div className="max-w-4xl">
      <Link href="/crm" className="text-sm text-neutral-500 hover:text-neutral-900">← Business Partners</Link>
      <PageHeader
        title={bp.companyName}
        description={`${bp.bpNumber} · ${group?.name ?? "No account group"} · Web Store: ${WEB_STORE_LABEL[bp.webStoreStatus]}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Details / edit */}
          <Card>
            <h2 className="mb-4 text-sm font-semibold text-neutral-900">Account details</h2>
            {editable ? (
              <BpEditForm
                bp={{
                  id: bp.id,
                  companyName: bp.companyName,
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

          {/* Activity log */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Activity log</h2>
            {editable && (
              <form action={addActivityAction} className="mb-4 space-y-2">
                <input type="hidden" name="bpId" value={bp.id} />
                <div className="flex gap-2">
                  <select name="type" className="rounded-md border border-neutral-300 bg-white px-2 py-2 text-sm">
                    {Object.entries(ACTIVITY_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <input
                    name="content"
                    required
                    placeholder="Log a note, call, email, or visit…"
                    className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
                  />
                  <button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Log</button>
                </div>
              </form>
            )}
            <ul className="space-y-3">
              {activityRows.length === 0 && <li className="text-sm text-neutral-400">No activity logged yet.</li>}
              {activityRows.map((a) => (
                <li key={a.id} className="border-l-2 border-neutral-200 pl-3">
                  <p className="text-sm text-neutral-800">{a.content}</p>
                  <p className="text-xs text-neutral-400">
                    {ACTIVITY_LABEL[a.type]} · {a.author ?? "Unknown"} · {a.createdAt.toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Contacts */}
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-neutral-900">Contacts</h2>
            <ul className="space-y-3">
              {contactRows.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                      {c.isPrimary && <span className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Primary</span>}
                    </p>
                    {c.title && <p className="text-xs text-neutral-500">{c.title}</p>}
                    {c.email && <p className="text-xs text-neutral-500">{c.email}</p>}
                    {c.phone && <p className="text-xs text-neutral-500">{c.phone}</p>}
                  </div>
                  {editable && !c.isPrimary && (
                    <form action={deleteContactAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="bpId" value={bp.id} />
                      <button className="text-xs text-red-600 hover:text-red-800">Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>

            {editable && (
              <form action={addContactAction} className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
                <input type="hidden" name="bpId" value={bp.id} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="firstName" placeholder="First name" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                  <input name="lastName" placeholder="Last name" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                </div>
                <input name="title" placeholder="Title" className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                <input name="email" type="email" placeholder="Email" className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                <input name="phone" placeholder="Phone" className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm" />
                <label className="flex items-center gap-2 text-xs text-neutral-600">
                  <input type="checkbox" name="isPrimary" className="h-4 w-4" /> Make primary contact
                </label>
                <button className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                  Add contact
                </button>
              </form>
            )}
          </Card>
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
