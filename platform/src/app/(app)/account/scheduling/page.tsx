import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/db";
import { schedulingProfiles, availabilityBlocks } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { CopyLink } from "@/components/orders/copy-link";
import { saveAvailabilityAction } from "@/lib/scheduling/actions";
import { ProfileForm } from "./profile-form";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const input = "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900";

export default async function SchedulingSettingsPage() {
  const user = await requireUser();
  const profile = await db.query.schedulingProfiles.findFirst({ where: eq(schedulingProfiles.userId, user.id) });
  const blocks = await db.select().from(availabilityBlocks).where(eq(availabilityBlocks.userId, user.id));
  const byDay = new Map(blocks.map((b) => [b.weekday, b]));
  const base = process.env.APP_URL ?? "https://makeready.g54.com";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Scheduling" description="Set your availability and share your booking link with customers." />

      {profile?.active && (
        <Card className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Your booking link</h2>
          <CopyLink url={`${base}/schedule/${profile.slug}`} />
        </Card>
      )}

      <Card className="mb-6">
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">Booking settings</h2>
        <ProfileForm
          slug={profile?.slug ?? ""}
          timezone={profile?.timezone ?? "America/Denver"}
          active={profile?.active ?? true}
          minNoticeHours={profile?.minNoticeHours ?? 12}
          slotIntervalMin={profile?.slotIntervalMin ?? 30}
          bookingWindowDays={profile?.bookingWindowDays ?? 21}
        />
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-neutral-900">Weekly availability</h2>
        <p className="mb-4 text-xs text-neutral-500">Times are in your timezone. One window per day.</p>
        <form action={saveAvailabilityAction} className="space-y-2">
          {DAYS.map((name, d) => {
            const b = byDay.get(d);
            const on = !!b || (d >= 1 && d <= 5 && !blocks.length); // default Mon–Fri when unset
            return (
              <div key={d} className="flex items-center gap-3">
                <label className="flex w-32 items-center gap-2 text-sm text-neutral-700">
                  <input type="checkbox" name={`day_${d}_on`} defaultChecked={on} className="h-4 w-4" /> {name}
                </label>
                <input type="time" name={`day_${d}_start`} defaultValue={b ? hhmm(b.startMin) : "09:00"} className={input} />
                <span className="text-neutral-400">to</span>
                <input type="time" name={`day_${d}_end`} defaultValue={b ? hhmm(b.endMin) : "17:00"} className={input} />
              </div>
            );
          })}
          <button className="mt-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700">Save availability</button>
        </form>
      </Card>
    </div>
  );
}
