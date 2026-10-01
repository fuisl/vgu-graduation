-- Working estimate for the ceremony date (#83): 20 November 2026, which becomes the final
-- date unless the organisers announce otherwise. The time stays unconfirmed (time_confirmed
-- false). Only the untouched 0001 placeholder moves, so a date an admin already set in the
-- admin UI is kept. sequence is bumped so subscribed calendars pick up the change.
UPDATE "event_config"
SET "starts_at" = '2026-11-20T09:00:00+07:00', "sequence" = "sequence" + 1, "updated_at" = now()
WHERE "id" = 1 AND "starts_at" = '2026-11-14T09:00:00+07:00' AND "ends_at" IS NULL;
