import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { glAccounts } from "@/db/schema";
import { requireModule } from "@/lib/auth/guards";
import { canEdit } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PageHeader, Card } from "@/components/ui";
import { JournalForm } from "./journal-form";

export const dynamic = "force-dynamic";

export default async function NewJournalPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireModule("accounting");
  if (!canEdit(user.roles, "accounting")) redirect("/accounting/journal");
  const { err } = await searchParams;

  const accounts = await db.select({ id: glAccounts.id, code: glAccounts.code, name: glAccounts.name, type: glAccounts.type })
    .from(glAccounts).where(eq(glAccounts.active, true)).orderBy(asc(glAccounts.code));
  const today = DateTime.now().setZone("America/Denver").toFormat("yyyy-LL-dd");

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/accounting/journal" className="text-sm text-neutral-500 hover:text-neutral-900">← Journal</Link>
      <PageHeader title="New journal entry" description="Record a balanced double-entry transaction. Debits must equal credits to post." />
      {err && <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">{err}</div>}
      <Card>
        <JournalForm accounts={accounts} today={today} />
      </Card>
    </div>
  );
}
