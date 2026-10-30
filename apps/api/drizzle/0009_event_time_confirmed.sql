-- The ceremony date is confirmed (owner, 2026-10-30): 20 November 2026 (#83). The time is set
-- to the standard 09:00 to 12:00 and marked confirmed, so pages, emails and calendars show it.
-- Only the 0004 estimate moves, so details an admin already set in the admin UI are kept.
-- sequence is bumped so subscribed calendars pick up the change.
UPDATE "event_config"
SET "ends_at" = '2026-11-20T12:00:00+07:00', "time_confirmed" = true, "sequence" = "sequence" + 1, "updated_at" = now()
WHERE "id" = 1 AND "starts_at" = '2026-11-20T09:00:00+07:00' AND "ends_at" IS NULL AND "time_confirmed" = false;
