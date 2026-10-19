-- ADR-013: the worker remembers how far it has read the mailbox for calendar RSVP replies.
-- Additive: a new table with no message content, sender or subject.
CREATE TABLE "mail_cursors" (
	"mailbox" text PRIMARY KEY NOT NULL,
	"uid_validity" bigint NOT NULL,
	"last_uid" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER mail_cursors_set_updated_at BEFORE UPDATE ON mail_cursors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
