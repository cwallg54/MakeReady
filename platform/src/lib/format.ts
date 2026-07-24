/**
 * Date/time formatting. All timestamps are stored in UTC and displayed in
 * Salt Lake City / Mountain Time (America/Denver handles MST/MDT automatically).
 */
const TZ = "America/Denver";

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  dateStyle: "medium",
  timeStyle: "short",
});

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  dateStyle: "medium",
});

export function fmtDateTime(d: Date | null | undefined): string {
  return d ? dateTimeFmt.format(d) : "—";
}

export function fmtDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "—";
}
