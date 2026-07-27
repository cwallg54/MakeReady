import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";

export interface RateResult {
  ok: boolean;
  /** Seconds until the window resets (only meaningful when !ok). */
  retryAfterSec: number;
  /** Attempts used in the current window. */
  count: number;
}

/**
 * Atomic fixed-window rate limiter backed by Postgres. Safe across serverless
 * instances (unlike an in-memory Map). One statement does the upsert + rollover
 * so concurrent requests can't race past the limit.
 *
 * Returns ok=false once `count` exceeds `limit` within `windowSec`.
 */
export async function consumeRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSec: number,
): Promise<RateResult> {
  const key = `${bucket}:${identifier}`;
  const res = await db.execute(sql`
    insert into rate_limits (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec})
                          then now() else rate_limits.window_start end
    returning count, ceil(${windowSec} - extract(epoch from (now() - window_start)))::int as retry_after
  `);
  const row = (res.rows?.[0] ?? {}) as { count?: number; retry_after?: number };
  const count = Number(row.count ?? 1);
  return {
    ok: count <= limit,
    retryAfterSec: Math.max(0, Number(row.retry_after ?? windowSec)),
    count,
  };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Human-friendly "try again in N minutes/seconds". */
export function retryMessage(sec: number): string {
  if (sec >= 90) return `Try again in about ${Math.ceil(sec / 60)} minutes.`;
  return `Try again in about ${Math.max(1, sec)} seconds.`;
}
