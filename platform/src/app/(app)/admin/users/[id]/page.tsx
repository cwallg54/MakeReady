import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, userRoles } from "@/db/schema";
import { Card } from "@/components/ui";
import { UserEditForm } from "./user-edit-form";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) notFound();

  const roles = await db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, id));

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin/users" className="text-sm text-neutral-500 hover:text-neutral-900">
        ← All users
      </Link>
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">Edit user</h2>
        <UserEditForm id={user.id} name={user.name} email={user.email} phone={user.phone ?? ""} roles={roles.map((r) => r.role)} />
      </Card>
    </div>
  );
}
