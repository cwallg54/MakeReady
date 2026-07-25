import Link from "next/link";
import { and, asc, eq, gte } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { schedulingProfiles, availabilityBlocks, meetingTypes, meetings, users } from "@/db/schema";
import { Logo } from "@/components/logo";
import { computeSlots, type AvailBlock } from "@/lib/scheduling/slots";
import { BookingForm } from "./booking-form";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string; slot?: string; booked?: string }>;
}) {
  const { slug } = await params;
  const { type, slot, booked } = await searchParams;
  const profile = await db.query.schedulingProfiles.findFirst({ where: and(eq(schedulingProfiles.slug, slug), eq(schedulingProfiles.active, true)) });

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-neutral-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Logo markClassName="h-10 w-auto" className="mb-8 text-neutral-900" />
        {children}
        <p className="mt-6 text-center text-xs text-neutral-400">MakeReady by G54 · Commercial Print &amp; Production</p>
      </div>
    </div>
  );

  if (!profile) return shell(<div className="rounded-xl border border-neutral-200 bg-white p-8 text-center"><h1 className="text-lg font-semibold text-neutral-900">Not available</h1><p className="mt-1 text-sm text-neutral-500">This booking link isn&apos;t active.</p></div>);

  const host = await db.query.users.findFirst({ where: eq(users.id, profile.userId) });
  const types = await db.select().from(meetingTypes).where(eq(meetingTypes.active, true)).orderBy(asc(meetingTypes.sortOrder));

  if (booked) {
    return shell(
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">You&apos;re booked! 🎉</h1>
        <p className="mt-2 text-sm text-neutral-600">Your meeting with {host?.name ?? "our team"} is confirmed. You&apos;ll hear from us with details.</p>
      </div>,
    );
  }

  const selectedType = types.find((t) => t.id === type) ?? types[0];
  if (!selectedType) return shell(<div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">No meeting types are configured yet.</div>);

  // Booking form step
  if (slot) {
    const when = DateTime.fromISO(slot).setZone(profile.timezone).toFormat("cccc, LLL d 'at' h:mm a 'MT'");
    return shell(
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <Link href={`/schedule/${slug}?type=${selectedType.id}`} className="text-sm text-neutral-500 hover:text-neutral-900">← Back to times</Link>
        <h1 className="mt-2 text-xl font-bold text-neutral-900">{selectedType.name}</h1>
        <p className="mb-4 text-sm text-neutral-500">with {host?.name} · {selectedType.durationMin} min</p>
        <BookingForm slug={slug} meetingTypeId={selectedType.id} slot={slot} when={when} />
      </div>,
    );
  }

  // Slot picker step
  const availability = (await db.select().from(availabilityBlocks).where(eq(availabilityBlocks.userId, profile.userId))) as AvailBlock[];
  const busy = await db
    .select({ start: meetings.startAt, end: meetings.endAt })
    .from(meetings)
    .where(and(eq(meetings.hostUserId, profile.userId), eq(meetings.status, "scheduled"), gte(meetings.endAt, new Date())));
  const days = computeSlots({
    tz: profile.timezone,
    availability,
    durationMin: selectedType.durationMin,
    slotIntervalMin: profile.slotIntervalMin,
    minNoticeHours: profile.minNoticeHours,
    windowDays: profile.bookingWindowDays,
    busy,
  });

  return shell(
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">Book with {host?.name}</h1>
      <p className="mb-4 text-sm text-neutral-500">Choose a meeting type and time (times shown in {profile.timezone.replace("_", " ")}).</p>

      <div className="mb-6 flex flex-wrap gap-2">
        {types.map((t) => (
          <Link
            key={t.id}
            href={`/schedule/${slug}?type=${t.id}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${t.id === selectedType.id ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 ring-1 ring-neutral-300 hover:bg-neutral-50"}`}
          >
            {t.name} · {t.durationMin}m
          </Link>
        ))}
      </div>

      {days.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">No open times in the next {profile.bookingWindowDays} days. Please check back or contact us.</div>
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d.date} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-neutral-900">{d.label}</p>
              <div className="flex flex-wrap gap-2">
                {d.slots.map((s) => (
                  <Link key={s.startIso} href={`/schedule/${slug}?type=${selectedType.id}&slot=${encodeURIComponent(s.startIso)}`} className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50">
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,
  );
}
