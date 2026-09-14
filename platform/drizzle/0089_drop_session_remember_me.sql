-- "Remember me" no longer lengthens a session. One idle window applies to
-- everybody, so that after a timeout the user signs in again with their
-- password and their second factor -- no device stays trusted across sessions.
-- The checkbox now only remembers the email address typed into the login box.
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "remember_me";
