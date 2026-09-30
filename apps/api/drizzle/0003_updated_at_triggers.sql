-- The live display feed (#65) polls photos and wishes by updated_at. The
-- database keeps that column current on every UPDATE, so no writer (api,
-- worker, a manual fix in psql) can forget it and leave the display stale.
-- now() is the transaction start time: the feed's poll overlap covers the gap
-- between that and the commit.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER photos_set_updated_at BEFORE UPDATE ON photos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER wishes_set_updated_at BEFORE UPDATE ON wishes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
