import Link from "next/link";
import { and, asc, eq, gte, lt, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { meetings, meetingTypes, users, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";

const TZ = "America/Denver";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLOR: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 border-blue-300",
  green: "bg-emerald-100 text-emerald-800 border-emerald-300",
  amber: "bg-amber-100 text-amber-800 border-amber-300",
  purple: "bg-purple-100 text-purple-800 border-purple-300",
  red: "bg-red-100 text-red-800 border-red-300",
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; host?: string }> }) {
  await requireModule("sales");
  const { month, host } = await searchParams;

  const now = DateTime.now().setZone(TZ);
  const monthStart = (month && DateTime.fromFormat(month, "yyyy-LL", { zone: TZ }).isValid
    ? DateTime.fromFormat(month, "yyyy-LL", { zone: TZ })
    : now
  ).startOf("month");
  // 6-week grid starting on the Sunday on/before the 1st.
  const gridStart = monthStart.minus({ days: monthStart.weekday % 7 });
  const gridEnd = gridStart.plus({ days: 42 });

  const conds: SQL[] = [eq(meetings.status, "scheduled"), gte(meetings.startAt, gridStart.toJSDate()), lt(meetings.startAt, gridEnd.toJSDate())];
  if (host) conds.push(eq(meetings.hostUserId, host));

  const rows = await db
    .select({
      id: meetings.id,
      start: meetings.startAt,
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
    .orderBy(asc(meetings.startAt));

  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = DateTime.fromJSDate(r.start).setZone(TZ).toISODate()!;
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(r);
  }

  const hosts = await db.selectDistinct({ id: users.id, name: users.name }).from(meetings).innerJoin(users, eq(meetings.hostUserId, users.id));
  const prev = monthStart.minus({ months: 1 }).toFormat("yyyy-LL");
  const next = monthStart.plus({ months: 1 }).toFormat("yyyy-LL");
  const hostQ = host ? `&host=${host}` : "";
  const todayKey = now.toISODate();

  return (
    <div>
      <PageHeader title="Team Calendar" description="All scheduled meetings. Filter by host below." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/calendar?month=${prev}${hostQ}`} className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm hover:bg-neutral-50">←</Link>
          <span className="min-w-40 text-center text-sm font-semibold text-neutral-900">{monthStart.toFormat("LLLL yyyy")}</span>
          <Link href={`/calendar?month=${next}${hostQ}`} className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm hover:bg-neutral-50">→</Link>
          <Link href={`/calendar${host ? `?host=${host}` : ""}`} className="ml-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-50">Today</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/calendar?month=${monthStart.toFormat("yyyy-LL")}`} className={`rounded-full px-3 py-1 text-sm font-medium ${!host ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>Everyone</Link>
          {hosts.map((h) => (
            <Link key={h.id} href={`/calendar?month=${monthStart.toFormat("yyyy-LL")}&host=${h.id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${host === h.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"}`}>{h.name}</Link>
          ))}
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => {
              const day = gridStart.plus({ days: i });
              const key = day.toISODate()!;
              const inMonth = day.month === monthStart.month;
              const isToday = key === todayKey;
              const items = byDay.get(key) ?? [];
              return (
                <div key={key} className={`min-h-28 border-b border-r border-neutral-100 p-1.5 ${inMonth ? "bg-white" : "bg-neutral-50/60"}`}>
                  <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-neutral-900 font-semibold text-white" : inMonth ? "text-neutral-700" : "text-neutral-400"}`}>
                    {day.day}
                  </div>
                  <div className="space-y-1">
                    {items.map((m) => {
                      const t = DateTime.fromJSDate(m.start).setZone(TZ).toFormat("h:mm a");
                      return (
                        <div key={m.id} className={`rounded border px-1.5 py-1 text-[11px] leading-tight ${COLOR[m.color ?? "blue"] ?? COLOR.blue}`} title={`${m.typeName} · ${m.attendee}${m.company ? " · " + m.company : ""} · Host: ${m.hostName}`}>
                          <div className="font-semibold">{t} {m.typeName}</div>
                          <div className="truncate">{m.attendee}{m.company ? ` · ${m.company}` : ""}</div>
                          <div className="truncate opacity-70">Host: {m.hostName ?? "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
