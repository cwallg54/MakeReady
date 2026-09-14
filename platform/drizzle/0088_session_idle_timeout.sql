-- Sessions time out on inactivity rather than a fixed window after signing in.
-- "Remember me" now widens that idle window instead of setting an absolute
-- 30-day expiry, so the column has to be carried on the session itself.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "remember_me" boolean NOT NULL DEFAULT false;
