import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, userRoles } from "@/db/schema";

/** Users who can own accounts / be assigned tasks (active sales staff + admins). */
export async function getAssignableUsers(): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .selectDistinct({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.status, "active"), inArray(userRoles.role, ["admin", "sales_manager", "sales_rep"])))
    .orderBy(asc(users.name));
  return rows;
}
