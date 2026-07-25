import { DateTime } from "luxon";

export interface AvailBlock {
  weekday: number; // 0=Sun..6=Sat
  startMin: number;
  endMin: number;
}
export interface BusyInterval {
  start: Date;
  end: Date;
}
export interface DaySlots {
  date: string; // YYYY-MM-DD (host tz)
  label: string; // e.g. "Mon, Aug 4"
  slots: { startIso: string; endIso: string; label: string }[];
}

/** Compute bookable slots for a host over the booking window, in the host timezone. */
export function computeSlots(opts: {
  tz: string;
  availability: AvailBlock[];
  durationMin: number;
  slotIntervalMin: number;
  minNoticeHours: number;
  windowDays: number;
  busy: BusyInterval[];
  now?: Date;
}): DaySlots[] {
  const { tz, availability, durationMin, slotIntervalMin, minNoticeHours, windowDays, busy } = opts;
  const now = DateTime.fromJSDate(opts.now ?? new Date()).setZone(tz);
  const earliest = now.plus({ hours: minNoticeHours });
  const busyMs = busy.map((b) => [b.start.getTime(), b.end.getTime()] as const);

  const days: DaySlots[] = [];
  let day = now.startOf("day");
  for (let i = 0; i <= windowDays; i++, day = day.plus({ days: 1 })) {
    // luxon weekday: 1=Mon..7=Sun → our schema uses 0=Sun..6=Sat.
    const sunBased = day.weekday === 7 ? 0 : day.weekday;
    const blocks = availability.filter((b) => b.weekday === sunBased);
    if (!blocks.length) continue;

    const slots: DaySlots["slots"] = [];
    for (const b of blocks) {
      for (let m = b.startMin; m + durationMin <= b.endMin; m += slotIntervalMin) {
        const start = day.set({ hour: Math.floor(m / 60), minute: m % 60, second: 0, millisecond: 0 });
        const end = start.plus({ minutes: durationMin });
        if (start < earliest) continue;
        const sMs = start.toMillis();
        const eMs = end.toMillis();
        const conflict = busyMs.some(([bs, be]) => sMs < be && eMs > bs);
        if (conflict) continue;
        slots.push({ startIso: start.toUTC().toISO()!, endIso: end.toUTC().toISO()!, label: start.toFormat("h:mm a") });
      }
    }
    if (slots.length) days.push({ date: day.toISODate()!, label: day.toFormat("ccc, LLL d"), slots });
  }
  return days;
}

/** Validate a chosen slot start is still a legitimate open slot (server-side re-check). */
export function slotIsValid(opts: Parameters<typeof computeSlots>[0], startIso: string): { ok: boolean; endIso?: string } {
  const days = computeSlots(opts);
  for (const d of days) {
    const s = d.slots.find((x) => x.startIso === startIso);
    if (s) return { ok: true, endIso: s.endIso };
  }
  return { ok: false };
}
