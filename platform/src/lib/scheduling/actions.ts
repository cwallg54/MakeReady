"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { schedulingProfiles, availabilityBlocks, meetings, meetingTypes, notifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { audit } from "@/lib/audit";
import { computeSlots, slotIsValid, type AvailBlock } from "./slots";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "host";
}

export interface SchedState {
  error?: string;
  ok?: boolean;
}

async function busyFor(userId: string): Promise<{ start: Date; end: Date }[]> {
  const rows = await db
    .select({ start: meetings.startAt, end: meetings.endAt })
    .from(meetings)
    .where(and(eq(meetings.hostUserId, userId), eq(meetings.status, "scheduled"), gte(meetings.endAt, new Date())));
  return rows;
}

export async function saveProfileAction(_prev: SchedState, formData: FormData): Promise<SchedState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let slug = slugify(String(formData.get("slug") ?? "") || user.name);
  const existing = await db.query.schedulingProfiles.findFirst({ where: eq(schedulingProfiles.userId, user.id) });
  // Ensure slug uniqueness (excluding self).
  const clash = await db.query.schedulingProfiles.findFirst({ where: eq(schedulingProfiles.slug, slug) });
  if (clash && clash.userId !== user.id) slug = `${slug}-${user.id.slice(0, 4)}`;

  const values = {
    slug,
    timezone: String(formData.get("timezone") ?? "America/Denver") || "America/Denver",
    active: formData.get("active") === "on",
    minNoticeHours: Number(formData.get("minNoticeHours") ?? 12) || 12,
    slotIntervalMin: Number(formData.get("slotIntervalMin") ?? 30) || 30,
    bookingWindowDays: Number(formData.get("bookingWindowDays") ?? 21) || 21,
  };
  if (existing) {
    await db.update(schedulingProfiles).set(values).where(eq(schedulingProfiles.userId, user.id));
  } else {
    await db.insert(schedulingProfiles).values({ userId: user.id, ...values });
  }
  await audit({ userId: user.id, action: "scheduling.profile", entityType: "user", entityId: user.id });
  revalidatePath("/account/scheduling");
  return { ok: true };
}

export async function saveAvailabilityAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const blocks: { userId: string; weekday: number; startMin: number; endMin: number }[] = [];
  for (let d = 0; d < 7; d++) {
    if (formData.get(`day_${d}_on`) !== "on") continue;
    const start = String(formData.get(`day_${d}_start`) ?? "");
    const end = String(formData.get(`day_${d}_end`) ?? "");
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
    const sm = toMin(start), em = toMin(end);
    if (em > sm) blocks.push({ userId: user.id, weekday: d, startMin: sm, endMin: em });
  }
  await db.delete(availabilityBlocks).where(eq(availabilityBlocks.userId, user.id));
  if (blocks.length) await db.insert(availabilityBlocks).values(blocks);
  await audit({ userId: user.id, action: "scheduling.availability", entityType: "user", entityId: user.id });
  revalidatePath("/account/scheduling");
}

export interface BookState {
  error?: string;
}

export async function bookMeetingAction(_prev: BookState, formData: FormData): Promise<BookState> {
  const slug = String(formData.get("slug") ?? "");
  const meetingTypeId = String(formData.get("meetingTypeId") ?? "");
  const startIso = String(formData.get("slot") ?? "");
  const attendeeName = String(formData.get("attendeeName") ?? "").trim();
  const attendeeEmail = String(formData.get("attendeeEmail") ?? "").trim();
  if (!slug || !meetingTypeId || !startIso || !attendeeName) return { error: "Missing required details." };

  const profile = await db.query.schedulingProfiles.findFirst({ where: and(eq(schedulingProfiles.slug, slug), eq(schedulingProfiles.active, true)) });
  const type = await db.query.meetingTypes.findFirst({ where: eq(meetingTypes.id, meetingTypeId) });
  if (!profile || !type) return { error: "This scheduling link is not available." };

  const availability = (await db.select().from(availabilityBlocks).where(eq(availabilityBlocks.userId, profile.userId))) as AvailBlock[];
  const opts = {
    tz: profile.timezone,
    availability,
    durationMin: type.durationMin,
    slotIntervalMin: profile.slotIntervalMin,
    minNoticeHours: profile.minNoticeHours,
    windowDays: profile.bookingWindowDays,
    busy: await busyFor(profile.userId),
  };
  const check = slotIsValid(opts, startIso);
  if (!check.ok || !check.endIso) return { error: "That time is no longer available — please pick another." };

  await db.insert(meetings).values({
    meetingTypeId,
    hostUserId: profile.userId,
    attendeeName,
    attendeeEmail: attendeeEmail || null,
    attendeePhone: String(formData.get("attendeePhone") ?? "").trim() || null,
    startAt: new Date(startIso),
    endAt: new Date(check.endIso),
    notes: String(formData.get("notes") ?? "").trim() || null,
    source: "public",
  });
  // Notify the host.
  await db.insert(notifications).values({
    userId: profile.userId,
    type: "meeting",
    title: `New meeting: ${type.name}`,
    body: `${attendeeName} booked a ${type.name}.`,
    link: "/calendar",
  });
  await audit({ userId: profile.userId, action: "meeting.booked", entityType: "meeting", metadata: { type: type.name, attendeeName } });
  redirect(`/schedule/${slug}?booked=1`);
}

export async function cancelMeetingAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const m = await db.query.meetings.findFirst({ where: eq(meetings.id, id) });
  if (!m) return;
  await db.update(meetings).set({ status: "canceled" }).where(eq(meetings.id, id));
  await db.insert(notifications).values({
    userId: m.hostUserId,
    type: "meeting",
    title: "Meeting canceled",
    body: `${m.attendeeName}'s meeting was canceled by ${user.name}.`,
    link: `/calendar/${id}`,
  });
  await audit({ userId: user.id, action: "meeting.canceled", entityType: "meeting", entityId: id });
  revalidatePath("/calendar");
  redirect(`/calendar/${id}`);
}

export async function completeMeetingAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.update(meetings).set({ status: "completed" }).where(eq(meetings.id, id));
  await audit({ userId: user.id, action: "meeting.completed", entityType: "meeting", entityId: id });
  revalidatePath("/calendar");
  redirect(`/calendar/${id}`);
}

export async function rescheduleMeetingAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const startIso = String(formData.get("slot") ?? "");
  if (!id || !startIso) redirect(`/calendar/${id}`);

  const m = await db.query.meetings.findFirst({ where: eq(meetings.id, id) });
  if (!m) redirect("/calendar");

  const profile = await db.query.schedulingProfiles.findFirst({ where: eq(schedulingProfiles.userId, m.hostUserId) });
  const type = m.meetingTypeId ? await db.query.meetingTypes.findFirst({ where: eq(meetingTypes.id, m.meetingTypeId) }) : null;
  const durationMin = type?.durationMin ?? Math.round((m.endAt.getTime() - m.startAt.getTime()) / 60000);

  // Busy list for the host, excluding this meeting so its own slot doesn't block it.
  const busy = (await db
    .select({ id: meetings.id, start: meetings.startAt, end: meetings.endAt })
    .from(meetings)
    .where(and(eq(meetings.hostUserId, m.hostUserId), eq(meetings.status, "scheduled"), gte(meetings.endAt, new Date()))))
    .filter((b) => b.id !== id)
    .map((b) => ({ start: b.start, end: b.end }));

  const availability = (await db.select().from(availabilityBlocks).where(eq(availabilityBlocks.userId, m.hostUserId))) as AvailBlock[];
  const opts = {
    tz: profile?.timezone ?? "America/Denver",
    availability,
    durationMin,
    slotIntervalMin: profile?.slotIntervalMin ?? 30,
    minNoticeHours: profile?.minNoticeHours ?? 0,
    windowDays: profile?.bookingWindowDays ?? 60,
    busy,
  };
  const check = slotIsValid(opts, startIso);
  if (!check.ok || !check.endIso) redirect(`/calendar/${id}/reschedule?err=1`);

  const oldStart = m.startAt;
  await db.update(meetings).set({ startAt: new Date(startIso), endAt: new Date(check.endIso!) }).where(eq(meetings.id, id));
  await db.insert(notifications).values({
    userId: m.hostUserId,
    type: "meeting",
    title: "Meeting rescheduled",
    body: `${m.attendeeName}'s meeting was moved by ${user.name}.`,
    link: `/calendar/${id}`,
  });
  await audit({ userId: user.id, action: "meeting.rescheduled", entityType: "meeting", entityId: id, metadata: { from: oldStart.toISOString(), to: startIso } });
  revalidatePath("/calendar");
  redirect(`/calendar/${id}`);
}
