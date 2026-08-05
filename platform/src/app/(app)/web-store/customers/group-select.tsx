"use client";

import { setCustomerGroupAction } from "@/lib/store/actions";

export function GroupSelect({ id, groupId, groups }: { id: string; groupId: string | null; groups: { id: string; name: string }[] }) {
  return (
    <form action={setCustomerGroupAction}>
      <input type="hidden" name="id" value={id} />
      <select
        name="groupId"
        defaultValue={groupId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700 outline-none focus:border-brand"
      >
        <option value="">No group</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    </form>
  );
}
