import { and, desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { markAllReadAction } from "@/lib/admin/actions";

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  const hasUnread = rows.some((r) => !r.readAt);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        action={
          hasUnread ? (
            <form action={markAllReadAction}>
              <button className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                Mark all read
              </button>
            </form>
          ) : null
        }
      />
      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutral-400">You&apos;re all caught up.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {rows.map((n) => (
              <li key={n.id} className={`flex items-start gap-3 px-5 py-3 ${n.readAt ? "" : "bg-neutral-50"}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-red-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-900">{n.title}</p>
                  {n.body && <p className="text-sm text-neutral-500">{n.body}</p>}
                  <p className="mt-0.5 text-xs text-neutral-400">{n.createdAt.toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
