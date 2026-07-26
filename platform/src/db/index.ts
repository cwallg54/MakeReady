import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Neon serverless Pool driver — supports multi-statement transactions, which we
 * need so that a write and its audit-log entry commit atomically.
 *
 * Perf: route single (non-transaction) queries over HTTP fetch instead of the
 * websocket, removing the per-query WS handshake on serverless. Almost every
 * page load is single reads; db.transaction() still uses the websocket.
 */
neonConfig.poolQueryViaFetch = true;

const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
