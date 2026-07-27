"use client";

import { useState } from "react";
import { addContactAction, updateContactAction, deleteContactAction } from "@/lib/crm/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { PhoneLink, EmailLink } from "@/components/phone-link";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

const input =
  "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

export function ContactsManager({
  bpId,
  contacts,
  editable,
}: {
  bpId: string;
  contacts: Contact[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <ul className="space-y-3">
        {contacts.length === 0 && <li className="text-sm text-neutral-400">No contacts yet.</li>}
        {contacts.map((c) =>
          editing === c.id && editable ? (
            <li key={c.id}>
              <form action={updateContactAction} className="space-y-2 rounded-md border border-neutral-200 p-3" onSubmit={() => setEditing(null)}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="bpId" value={bpId} />
                <div className="grid grid-cols-2 gap-2">
                  <input name="firstName" defaultValue={c.firstName ?? ""} placeholder="First name" className={input} />
                  <input name="lastName" defaultValue={c.lastName ?? ""} placeholder="Last name" className={input} />
                </div>
                <input name="title" defaultValue={c.title ?? ""} placeholder="Title" className={input} />
                <input name="email" type="email" defaultValue={c.email ?? ""} placeholder="Email" className={input} />
                <input name="phone" defaultValue={c.phone ?? ""} placeholder="Phone" className={input} />
                <label className="flex items-center gap-2 text-xs text-neutral-600">
                  <input type="checkbox" name="isPrimary" defaultChecked={c.isPrimary} className="h-4 w-4" /> Primary contact
                </label>
                <div className="flex gap-2">
                  <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs">
                    Cancel
                  </button>
                </div>
              </form>
            </li>
          ) : (
            <li key={c.id} className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                  {c.isPrimary && <span className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white">Primary</span>}
                </p>
                {c.title && <p className="text-xs text-neutral-500">{c.title}</p>}
                {c.email && <p className="text-xs"><EmailLink email={c.email} /></p>}
                {c.phone && <p className="text-xs"><PhoneLink phone={c.phone} /></p>}
              </div>
              {editable && (
                <div className="flex shrink-0 gap-2 text-xs">
                  <button onClick={() => setEditing(c.id)} className="text-neutral-600 hover:text-neutral-900">Edit</button>
                  {!c.isPrimary && (
                    <form action={deleteContactAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="bpId" value={bpId} />
                      <ConfirmButton message="Remove this contact?" className="text-red-600 hover:text-red-800">Remove</ConfirmButton>
                    </form>
                  )}
                </div>
              )}
            </li>
          ),
        )}
      </ul>

      {editable && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          {adding ? (
            <form action={addContactAction} className="space-y-2" onSubmit={() => setAdding(false)}>
              <input type="hidden" name="bpId" value={bpId} />
              <div className="grid grid-cols-2 gap-2">
                <input name="firstName" placeholder="First name" className={input} />
                <input name="lastName" placeholder="Last name" className={input} />
              </div>
              <input name="title" placeholder="Title" className={input} />
              <input name="email" type="email" placeholder="Email" className={input} />
              <input name="phone" placeholder="Phone" className={input} />
              <label className="flex items-center gap-2 text-xs text-neutral-600">
                <input type="checkbox" name="isPrimary" className="h-4 w-4" /> Make primary contact
              </label>
              <div className="flex gap-2">
                <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white">Add contact</button>
                <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAdding(true)} className="text-sm font-medium text-neutral-700 hover:text-neutral-900">
              + Add contact
            </button>
          )}
        </div>
      )}
    </div>
  );
}
