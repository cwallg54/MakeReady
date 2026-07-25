import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { requireModule } from "@/lib/auth/guards";
import { db } from "@/db";
import { meetings, meetingTypes, users, businessPartners } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { cancelMeetingAction, completeMeetingAction } from "@/lib/scheduling/actions";

const TZ = "America/Denver";
const STATUS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-100 text-emerald-800",
  canceled: "bg-neutral-200 text-neutral-600",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-neutral-100 py-3 last:border-0 sm:flex-row sm:gap-4">
      <div className="w-40 shrink-0 text-sm font-medium text-neutral-500">{label}</div>
      <div className="text-sm text-neutral-900">{children}</div>
    </div>
  );
}

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("sales");
  const { id } = await params;

  const [m] = await db
    .select({
      id: meetings.id,
      status: meetings.status,
      start: meetings.startAt,
      end: meetings.endAt,
      attendee: meetings.attendeeName,
      email: meetings.attendeeEmail,
      phone: meetings.attendeePhone,
      notes: meetings.notes,
      source: meetings.source,
      createdAt: meetings.createdAt,
      bpId: meetings.bpId,
      typeName: meetingTypes.name,
      duration: meetingTypes.durationMin,
      hostName: users.name,
      hostEmail: users.email,
      company: businessPartners.companyName,
    })
    .from(meetings)
    .leftJoin(meetingTypes, eq(meetings.meetingTypeId, meetingTypes.id))
    .leftJoin(users, eq(meetings.hostUserId, users.id))
    .leftJoin(businessPartners, eq(meetings.bpId, businessPartners.id))
    .where(eq(meetings.id, id));

  if (!m) notFound();

  const start = DateTime.fromJSDate(m.start).setZone(TZ);
  const end = DateTime.fromJSDate(m.end).setZone(TZ);
  const backMonth = start.toFormat("yyyy-LL");

  return (
    <div className="max-w-2xl">
      <Link href={`/calendar?month=${backMonth}`} className="mb-3 inline-block text-sm text-neutral-500 hover:text-neutral-800">← Back to calendar</Link>
      <PageHeader title={m.typeName ?? "Meeting"} description={start.toFormat("cccc, LLLL d, yyyy")} />

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS[m.status] ?? STATUS.scheduled}`}>{m.status}</span>
          <span className="text-sm font-medium text-neutral-700">{start.toFormat("h:mm a")} – {end.toFormat("h:mm a")} ({m.duration ?? Math.round(end.diff(start, "minutes").minutes)} min) MT</span>
        </div>

        <Row label="Attendee">{m.attendee}</Row>
        <Row label="Email">{m.email ? <a href={`mailto:${m.email}`} className="text-blue-700 hover:underline">{m.email}</a> : <span className="text-neutral-400">—</span>}</Row>
        <Row label="Phone">{m.phone ? <a href={`tel:${m.phone}`} className="text-blue-700 hover:underline">{m.phone}</a> : <span className="text-neutral-400">—</span>}</Row>
        <Row label="Company">{m.bpId ? <Link href={`/crm/${m.bpId}`} className="text-blue-700 hover:underline">{m.company ?? "View account"}</Link> : m.company ?? <span className="text-neutral-400">—</span>}</Row>
        <Row label="Host">{m.hostName}{m.hostEmail ? <span className="text-neutral-400"> · {m.hostEmail}</span> : null}</Row>
        <Row label="Notes">{m.notes ? <span className="whitespace-pre-wrap">{m.notes}</span> : <span className="text-neutral-400">—</span>}</Row>
        <Row label="Booked">{DateTime.fromJSDate(m.createdAt).setZone(TZ).toFormat("LLL d, yyyy 'at' h:mm a")} · via {m.source}</Row>
      </Card>

      {m.status === "scheduled" && (
        <div className="flex flex-wrap gap-2">
          <form action={completeMeetingAction}>
            <input type="hidden" name="id" value={m.id} />
            <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Mark complete</button>
          </form>
          <Link href={`/calendar/${m.id}/reschedule`} className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Reschedule</Link>
          <form action={cancelMeetingAction}>
            <input type="hidden" name="id" value={m.id} />
            <ConfirmButton message="Cancel this meeting? The host will be notified." className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
              Cancel meeting
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}
