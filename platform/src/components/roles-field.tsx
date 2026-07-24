"use client";

import { ROLES, ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/db/schema";

export function RolesField({ selected = [] }: { selected?: Role[] }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-neutral-700">Roles</legend>
      <div className="grid grid-cols-2 gap-2">
        {ROLES.map((role) => (
          <label
            key={role}
            className="flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
          >
            <input
              type="checkbox"
              name="roles"
              value={role}
              defaultChecked={selected.includes(role)}
              className="h-4 w-4 rounded border-neutral-400"
            />
            {ROLE_LABELS[role]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
