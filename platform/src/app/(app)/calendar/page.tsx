import Link from "next/link";
import { and, asc, eq, gte, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { meetings, meetingTypes, users, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";

const TZ = "America/Denver";
const COLOR: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
  red: "bg-red-100 text-red-700",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ host?: string }> }) {
  await requireModule("sales");
  const { host } = await searchParams;

  const conds: SQL[] = [eq(meetings.status, "scheduled"), gte(meetings.startAt, new Date(Date.now() - 12 * 3600_000))];
  if (host) conds.push(eq(meetings.hostUserId, host));

  const rows = await db
    .select({
      id: meetings.id,
      start: meetings.startAt,
      end: meetings.endAt,
      attendee: meetings.attendeeName,
      typeName: meetingTypes.name,
      color: meetingTypes.color,
      hostName: users.name,
      company: businessPartners.companyName,
    })
    .from(meetings)
    .leftJoin(meetingTypes, eq(meetings.meetingTypeId, meetingTypes.id))
    .leftJoin(users, eq(meetings.hostUserId, users.id))
    .leftJoin(businessPartners, eq(meetings.bpId, businessPartners.id))
    .where(and(...conds))
    .orderBy(asc(meetings.startAt))
    .limit(300);

  const hosts = await db.selectDistinct({ id: users.id, name: users.name }).from(meetings).innerJoin(users, eq(meetings.hostUserId, users.id));

  // Group by day (MT).
  const groups = new Map<string, { label: string; items: typeof rows }>();
  for (const r of rows) {
    const dt = DateTime.fromJSDate(r.start).setZone(TZ);
    const key = dt.toISODate()!;
    if (!groups.has(key)) groups.set(key, { label: dt.toFormat("cccc, LLLL d"), items: [] });
    groups.get(key)!.items.push(r);
  }

  return (
    <div>
      <PageHeader title="Team Calendar" description="Upcoming meetings across the team." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/calendar" className={`rounded-full px-3 py-1 text-sm font-medium ${!host ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>Everyone</Link>
        {hosts.map((h) => (
          <Link key={h.id} href={`/calendar?host=${h.id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${host === h.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>{h.name}</Link>
        ))}
      </div>

      {groups.size === 0 ? (
        <Card><p className="text-sm text-neutral-400">No upcoming meetings.</p></Card>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([key, g]) => (
            <div key={key}>
              <h2 className="mb-2 text-sm font-semibold text-neutral-700">{g.label}</h2>
              <div className="space-y-2">
                {g.items.map((m) => {
                  const s = DateTime.fromJSDate(m.start).setZone(TZ);
                  const e = DateTime.fromJSDate(m.end).setZone(TZ);
                  return (
                    <Card key={m.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-28 text-sm font-medium text-neutral-900">{s.toFormat("h:mm a")}–{e.toFormat("h:mm a")}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR[m.color ?? "blue"] ?? COLOR.blue}`}>{m.typeName ?? "Meeting"}</span>
                        <span className="text-sm text-neutral-800">{m.attendee}{m.company ? ` · ${m.company}` : ""}</span>
                      </div>
                      <span className="shrink-0 text-xs text-neutral-500">Host: {m.hostName ?? "—"}</span>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
