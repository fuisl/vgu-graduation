-- Live feed (ADR-014). The feed polls photos and wishes by updated_at, now
-- whenever a gallery or display is open, so both get an index on it.
CREATE INDEX "idx_photos_updated_at" ON "photos" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_wishes_updated_at" ON "wishes" USING btree ("updated_at");--> statement-breakpoint
-- Wake-up hints, raised by the database itself so no writer (api, worker, a
-- manual fix in psql) can forget one. A notification is delivered only when
-- the writing transaction commits, and identical ones in a transaction are
-- folded into one. The payload is the table name only: never row data.
-- Listeners still read committed rows themselves and keep polling, so a lost
-- notification costs latency, never correctness.
CREATE FUNCTION notify_live_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('grad_live', TG_TABLE_NAME);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER photos_notify_live AFTER INSERT OR UPDATE ON photos
  FOR EACH STATEMENT EXECUTE FUNCTION notify_live_change();
--> statement-breakpoint
CREATE TRIGGER wishes_notify_live AFTER INSERT OR UPDATE ON wishes
  FOR EACH STATEMENT EXECUTE FUNCTION notify_live_change();
--> statement-breakpoint
-- The worker claims a new job at once instead of sleeping out its idle poll.
CREATE FUNCTION notify_job_queued() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('grad_jobs', 'jobs');
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER jobs_notify_worker AFTER INSERT ON jobs
  FOR EACH STATEMENT EXECUTE FUNCTION notify_job_queued();
