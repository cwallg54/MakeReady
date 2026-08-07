/** Default artwork time (minutes) per production type — a first estimate that
 *  art can override. Reusing an existing design roughly halves it. */
export const AUTO_ESTIMATE_MINUTES: Record<string, number> = {
  screen_print: 90,
  embroidery: 120, // digitizing runs longer
  headwear: 60,
  hard_goods: 45,
  other: 60,
};

export function estimateArtMinutes(productionType: string | null, reused: boolean): number | null {
  if (!productionType) return null;
  const base = AUTO_ESTIMATE_MINUTES[productionType] ?? 60;
  return reused ? Math.round(base / 2) : base;
}

export interface SchedJob {
  id: string;
  orderNumber: string;
  company: string;
  status: string;
  priority: string; // none | p1 | p2
  rush: boolean;
  estimatedMinutes: number | null;
  dueDate: Date | null;
}

/** Queue order: Priority 1, then Priority 2, then rush, then earliest due date,
 *  then oldest. Lower rank sorts first. */
function rank(j: SchedJob): number {
  if (j.priority === "p1") return 0;
  if (j.priority === "p2") return 1;
  if (j.rush) return 2;
  return 3;
}

export function sortQueue(jobs: SchedJob[]): SchedJob[] {
  return [...jobs].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const da = a.dueDate ? a.dueDate.getTime() : Infinity;
    const db = b.dueDate ? b.dueDate.getTime() : Infinity;
    return da - db;
  });
}

export interface ScheduledJob extends SchedJob {
  cumulativeMinutes: number; // running total incl. this job
  daysOut: number; // projected working days until finished
}

const MINUTES_PER_DAY = 360; // ~6 productive hours

/** Sort a queue and compute the cumulative time + projected working-day finish. */
export function buildSchedule(jobs: SchedJob[]): ScheduledJob[] {
  let cumulative = 0;
  return sortQueue(jobs).map((j) => {
    cumulative += j.estimatedMinutes ?? 0;
    return { ...j, cumulativeMinutes: cumulative, daysOut: Math.max(1, Math.ceil(cumulative / MINUTES_PER_DAY)) };
  });
}

export const hours = (min: number) => `${(min / 60).toFixed(1)}h`;
