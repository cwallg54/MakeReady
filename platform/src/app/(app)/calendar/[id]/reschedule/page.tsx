import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, gte } from "drizzle-orm";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { meetings, meetingTypes, schedulingProfiles, availabilityBlocks } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { computeSlots, type AvailBlock } from "@/lib/scheduling/slots";
import { rescheduleMeetingAction } from "@/lib/scheduling/actions";

export const dynamic = "force-dynamic";
const TZ = "America/Denver";

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ slot?: string; err?: string }>;
}) {
  await requireModule("sales");
  const { id } = await params;
  const { slot, err } = await searchParams;

  const m = await db.query.meetings.findFirst({ where: eq(meetings.id, id) });
  if (!m) notFound();

  const type = m.meetingTypeId ? await db.query.meetingTypes.findFirst({ where: eq(meetingTypes.id, m.meetingTypeId) }) : null;
  const durationMin = type?.durationMin ?? Math.round((m.endAt.getTime() - m.startAt.getTime()) / 60000);
  const profile = await db.query.schedulingProfiles.findFirst({ where: eq(schedulingProfiles.userId, m.hostUserId) });
  const tz = profile?.timezone ?? TZ;

  const current = DateTime.fromJSDate(m.startAt).setZone(tz).toFormat("cccc, LLL d 'at' h:mm a 'MT'");

  // Confirm step
  if (slot) {
    const when = DateTime.fromISO(slot).setZone(tz).toFormat("cccc, LLL d 'at' h:mm a 'MT'");
    return (
      <div className="max-w-xl">
        <Link href={`/calendar/${id}/reschedule`} className="mb-3 inline-block text-sm text-neutral-500 hover:text-neutral-800">← Back to times</Link>
        <PageHeader title="Confirm new time" description={`${type?.name ?? "Meeting"} with ${m.attendeeName}`} />
        <Card>
          <p className="text-sm text-neutral-500">Current time</p>
          <p className="mb-3 text-sm font-medium text-neutral-500 line-through">{current}</p>
          <p className="text-sm text-neutral-500">New time</p>
          <p className="mb-4 text-base font-semibold text-neutral-900">{when}</p>
          <form action={rescheduleMeetingAction} className="flex gap-2">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="slot" value={slot} />
            <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Confirm reschedule</button>
            <Link href={`/calendar/${id}`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Cancel</Link>
          </form>
        </Card>
      </div>
    );
  }

  // Slot picker
  const availability = (await db.select().from(availabilityBlocks).where(eq(availabilityBlocks.userId, m.hostUserId))) as AvailBlock[];
  const busy = (await db
    .select({ mid: meetings.id, start: meetings.startAt, end: meetings.endAt })
    .from(meetings)
    .where(and(eq(meetings.hostUserId, m.hostUserId), eq(meetings.status, "scheduled"), gte(meetings.endAt, new Date()))))
    .filter((b) => b.mid !== id)
    .map((b) => ({ start: b.start, end: b.end }));

  const days = computeSlots({
    tz,
    availability,
    durationMin,
    slotIntervalMin: profile?.slotIntervalMin ?? 30,
    minNoticeHours: profile?.minNoticeHours ?? 0,
    windowDays: profile?.bookingWindowDays ?? 60,
    busy,
  });

  return (
    <div className="max-w-2xl">
      <Link href={`/calendar/${id}`} className="mb-3 inline-block text-sm text-neutral-500 hover:text-neutral-800">← Back to meeting</Link>
      <PageHeader title="Reschedule meeting" description={`${type?.name ?? "Meeting"} with ${m.attendeeName} · ${durationMin} min`} />
      {err && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">That time is no longer available — please pick another.</p>}
      <p className="mb-4 text-sm text-neutral-500">Current time: <span className="font-medium text-neutral-700">{current}</span>. Times shown in {tz.replace("_", " ")}.</p>

      {days.length === 0 ? (
        <Card className="text-center text-sm text-neutral-500">No open times available for {profile ? "this host" : "the host"} in the booking window.</Card>
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <Card key={d.date} className="p-4">
              <p className="mb-2 text-sm font-semibold text-neutral-900">{d.label}</p>
              <div className="flex flex-wrap gap-2">
                {d.slots.map((s) => (
                  <Link key={s.startIso} href={`/calendar/${id}/reschedule?slot=${encodeURIComponent(s.startIso)}`} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50">
                    {s.label}
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
