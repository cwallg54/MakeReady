import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { requireModule } from "@/lib/auth/guards";
import { canEdit, canSeeBpFinance } from "@/lib/rbac";
import { db } from "@/db";
import { accountGroups } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { BpCreateForm } from "./bp-create-form";

export default async function NewBpPage() {
  const user = await requireModule("crm");
  if (!canEdit(user.roles, "crm")) redirect("/403");

  const groups = await db
    .select({ id: accountGroups.id, name: accountGroups.name })
    .from(accountGroups)
    .orderBy(asc(accountGroups.name));

  return (
    <div className="max-w-3xl">
      <Link href="/crm" className="text-sm text-neutral-500 hover:text-neutral-900">← Business Partners</Link>
      <PageHeader title="New Business Partner" />
      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">
            No account groups exist yet. An administrator needs to create at least one in{" "}
            <Link href="/admin/account-groups" className="font-medium underline">Administration → Account Groups</Link>{" "}
            before adding a Business Partner.
          </p>
        </Card>
      ) : (
        <Card>
          <BpCreateForm groups={groups} showFinance={canSeeBpFinance(user.roles)} />
        </Card>
      )}
    </div>
  );
}
