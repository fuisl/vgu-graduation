CREATE TABLE "guide_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"map_url" text,
	"time_hint" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_items_category_check" CHECK ("guide_items"."category" IN ('photo-spot', 'food-drink', 'explore', 'relax', 'practical')),
	CONSTRAINT "guide_items_title_check" CHECK (char_length("guide_items"."title") BETWEEN 1 AND 120),
	CONSTRAINT "guide_items_description_check" CHECK (char_length("guide_items"."description") <= 500),
	CONSTRAINT "guide_items_time_hint_check" CHECK (char_length("guide_items"."time_hint") <= 80),
	CONSTRAINT "guide_items_map_url_check" CHECK ("guide_items"."map_url" IS NULL OR "guide_items"."map_url" LIKE 'https://%')
);
--> statement-breakpoint
CREATE TABLE "invitation_guide_items" (
	"invitation_id" uuid NOT NULL,
	"guide_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_guide_items_invitation_id_guide_item_id_pk" PRIMARY KEY("invitation_id","guide_item_id")
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_id" uuid NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_by_admin" text,
	"requested_by_invitation_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_jobs_status_check" CHECK ("print_jobs"."status" IN ('queued', 'printing', 'done', 'failed')),
	CONSTRAINT "print_jobs_copies_check" CHECK ("print_jobs"."copies" BETWEEN 1 AND 5),
	CONSTRAINT "print_jobs_attempts_check" CHECK ("print_jobs"."attempts" >= 0),
	CONSTRAINT "print_jobs_error_length_check" CHECK (char_length("print_jobs"."error") <= 500)
);
--> statement-breakpoint
CREATE TABLE "rsvp_accessibility" (
	"rsvp_id" uuid PRIMARY KEY NOT NULL,
	"wheelchair" boolean DEFAULT false NOT NULL,
	"step_free_access" boolean DEFAULT false NOT NULL,
	"captions" boolean DEFAULT false NOT NULL,
	"seat_near_speakers" boolean DEFAULT false NOT NULL,
	"large_print" boolean DEFAULT false NOT NULL,
	"vision_assistance" boolean DEFAULT false NOT NULL,
	"seat_near_front" boolean DEFAULT false NOT NULL,
	"aisle_seat" boolean DEFAULT false NOT NULL,
	"companion" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsvp_accessibility_note_length_check" CHECK (char_length("rsvp_accessibility"."note") <= 500)
);
--> statement-breakpoint
-- #170: given and family name next to the full name. Existing rows are backfilled
-- with the rules of splitPersonName (packages/contract/src/names.ts, documented in
-- docs/architecture/data-model.md) and stay name_reviewed = false until an admin
-- confirms them. Keep the two surname lists in sync with names.ts. They are spelled
-- out in lowercase, Title case and UPPER case, with and without diacritics, because
-- lower() is not Unicode-aware under the C collation CloudNativePG defaults to.
-- The function stays: the triggers below use it for rows inserted without a given name.
CREATE FUNCTION split_person_name(full_name text, OUT given text, OUT family text)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  common_names text[] := ARRAY[
    'nguyễn', 'Nguyễn', 'NGUYỄN', 'nguyen', 'Nguyen', 'NGUYEN', 'trần', 'Trần', 'TRẦN', 'tran', 'Tran', 'TRAN',
    'lê', 'Lê', 'LÊ', 'le', 'Le', 'LE', 'phạm', 'Phạm', 'PHẠM', 'pham', 'Pham', 'PHAM',
    'hoàng', 'Hoàng', 'HOÀNG', 'hoang', 'Hoang', 'HOANG', 'huỳnh', 'Huỳnh', 'HUỲNH', 'huynh', 'Huynh', 'HUYNH',
    'phan', 'Phan', 'PHAN', 'vũ', 'Vũ', 'VŨ', 'vu', 'Vu', 'VU', 'võ', 'Võ', 'VÕ',
    'vo', 'Vo', 'VO', 'đặng', 'Đặng', 'ĐẶNG', 'dang', 'Dang', 'DANG', 'bùi', 'Bùi', 'BÙI',
    'bui', 'Bui', 'BUI', 'đỗ', 'Đỗ', 'ĐỖ', 'do', 'Do', 'DO', 'hồ', 'Hồ', 'HỒ',
    'ho', 'Ho', 'HO', 'ngô', 'Ngô', 'NGÔ', 'ngo', 'Ngo', 'NGO', 'dương', 'Dương', 'DƯƠNG',
    'duong', 'Duong', 'DUONG', 'lý', 'Lý', 'LÝ', 'ly', 'Ly', 'LY'
  ];
  other_names text[] := ARRAY[
    'đinh', 'Đinh', 'ĐINH', 'dinh', 'Dinh', 'DINH', 'đào', 'Đào', 'ĐÀO', 'dao', 'Dao', 'DAO',
    'trương', 'Trương', 'TRƯƠNG', 'truong', 'Truong', 'TRUONG', 'lâm', 'Lâm', 'LÂM', 'lam', 'Lam', 'LAM',
    'mai', 'Mai', 'MAI', 'trịnh', 'Trịnh', 'TRỊNH', 'trinh', 'Trinh', 'TRINH', 'đoàn', 'Đoàn', 'ĐOÀN',
    'doan', 'Doan', 'DOAN', 'cao', 'Cao', 'CAO', 'lương', 'Lương', 'LƯƠNG', 'luong', 'Luong', 'LUONG',
    'hà', 'Hà', 'HÀ', 'ha', 'Ha', 'HA', 'tạ', 'Tạ', 'TẠ', 'ta', 'Ta', 'TA',
    'châu', 'Châu', 'CHÂU', 'chau', 'Chau', 'CHAU', 'tôn', 'Tôn', 'TÔN', 'ton', 'Ton', 'TON',
    'thái', 'Thái', 'THÁI', 'thai', 'Thai', 'THAI', 'quách', 'Quách', 'QUÁCH', 'quach', 'Quach', 'QUACH',
    'kiều', 'Kiều', 'KIỀU', 'kieu', 'Kieu', 'KIEU', 'từ', 'Từ', 'TỪ', 'tu', 'Tu', 'TU',
    'lưu', 'Lưu', 'LƯU', 'luu', 'Luu', 'LUU', 'triệu', 'Triệu', 'TRIỆU', 'trieu', 'Trieu', 'TRIEU',
    'khổng', 'Khổng', 'KHỔNG', 'khong', 'Khong', 'KHONG', 'vương', 'Vương', 'VƯƠNG', 'vuong', 'Vuong', 'VUONG',
    'chu', 'Chu', 'CHU'
  ];
  words text[];
  n int;
  first_word text;
  last_word text;
BEGIN
  words := regexp_split_to_array(btrim(normalize(full_name, NFC)), '\s+');
  n := coalesce(array_length(words, 1), 0);
  IF n <= 1 THEN
    -- Rule 1: one word is the given name.
    given := btrim(normalize(full_name, NFC));
    family := NULL;
    RETURN;
  END IF;
  first_word := words[1];
  last_word := words[n];
  IF n = 2 AND (last_word = ANY(common_names) OR lower(last_word) = ANY(common_names)) THEN
    -- Rule 2: a Vietnamese name in Western order ("Mai Tran").
    given := first_word;
    family := last_word;
  ELSIF first_word = ANY(common_names || other_names) OR lower(first_word) = ANY(common_names || other_names) THEN
    -- Rule 3: Vietnamese order ("Nguyễn Văn An" is called "An").
    given := last_word;
    family := first_word;
  ELSE
    -- Rule 4: Western order ("John Smith" is called "John").
    given := first_word;
    family := last_word;
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "name_reviewed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "guests" SET "given_name" = s.given, "family_name" = s.family
FROM (SELECT "id", (split_person_name("name")).* FROM "guests") s
WHERE s."id" = "guests"."id";--> statement-breakpoint
ALTER TABLE "guests" ALTER COLUMN "given_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "given_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "family_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "name_reviewed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "given_name" = s.given, "family_name" = s.family
FROM (SELECT "id", (split_person_name("name")).* FROM "users") s
WHERE s."id" = "users"."id";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "given_name" SET NOT NULL;--> statement-breakpoint
-- Any writer that inserts only a full name (psql, seeds, other modules' tests) still gets
-- the split, unreviewed. The API always sends given_name itself. NOT NULL is checked
-- after BEFORE triggers, so this runs first.
CREATE FUNCTION set_default_given_name() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  s record;
BEGIN
  IF NEW.given_name IS NULL THEN
    s := split_person_name(NEW.name);
    NEW.given_name := s.given;
    NEW.family_name := coalesce(NEW.family_name, s.family);
    NEW.name_reviewed := false;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER guests_default_given_name BEFORE INSERT ON guests
  FOR EACH ROW EXECUTE FUNCTION set_default_given_name();
--> statement-breakpoint
CREATE TRIGGER users_default_given_name BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION set_default_given_name();
--> statement-breakpoint
ALTER TABLE "wishes" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation_guide_items" ADD CONSTRAINT "invitation_guide_items_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_guide_items" ADD CONSTRAINT "invitation_guide_items_guide_item_id_guide_items_id_fk" FOREIGN KEY ("guide_item_id") REFERENCES "public"."guide_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_requested_by_invitation_id_invitations_id_fk" FOREIGN KEY ("requested_by_invitation_id") REFERENCES "public"."invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rsvp_accessibility" ADD CONSTRAINT "rsvp_accessibility_rsvp_id_rsvp_id_fk" FOREIGN KEY ("rsvp_id") REFERENCES "public"."rsvp"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invitation_guide_items_item" ON "invitation_guide_items" USING btree ("guide_item_id");--> statement-breakpoint
CREATE INDEX "idx_print_jobs_queue" ON "print_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_print_jobs_invitation" ON "print_jobs" USING btree ("requested_by_invitation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_photos_public" ON "photos" USING btree ("created_at") WHERE "photos"."is_public";--> statement-breakpoint
CREATE INDEX "idx_wishes_public" ON "wishes" USING btree ("created_at") WHERE "wishes"."is_public";--> statement-breakpoint
-- #140: default guide-book items for guests at the VGU campus in Ben Cat, Binh Duong.
-- Drafts only: generic descriptions, no opening hours or claims to verify, no map
-- links yet. Admins edit them under /admin/guide; invitations with no picks show
-- every active item.
INSERT INTO "guide_items" ("title", "category", "description", "time_hint", "sort_order") VALUES
  -- TODO(owner): confirm the main gate sign is the photo spot guests should use.
  ('Main gate photo spot', 'photo-spot', 'The university sign at the main entrance makes a classic first photo with your graduate.', '5–10 min', 10),
  -- TODO(owner): confirm which spot outside the ceremony hall works for family photos.
  ('Outside the ceremony hall', 'photo-spot', 'The area just outside the hall works well for family photos once the ceremony ends.', '10 min', 20),
  -- TODO(owner): confirm there is a lake or pond on campus and where to walk.
  ('Lakeside walk', 'relax', 'A quiet walk by the water on campus, away from the crowd around the hall.', '15–30 min', 30),
  -- TODO(owner): confirm visitors may enter the library on the day.
  ('University library', 'explore', 'See where many study hours of the last four years went. Ask the staff whether visitors may go in on the day.', '15 min', 40),
  -- TODO(owner): confirm which lecture buildings guests can walk past.
  ('Lecture buildings', 'explore', 'Walk past the lecture halls and labs where the graduates studied.', '15 min', 50),
  -- TODO(owner): confirm the canteen is open on the ceremony day.
  ('Campus canteen', 'food-drink', 'Get a drink or a snack while you wait for your graduate.', NULL, 60),
  -- TODO(owner): name one or two cafés near the campus, or drop this item.
  ('Cafés near campus', 'food-drink', 'For a longer break, there are cafés a short ride from the campus.', '30–60 min', 70),
  -- TODO(owner): confirm where guests can sit in the shade.
  ('Shaded seating', 'relax', 'Benches and shaded spots around campus to rest out of the sun.', NULL, 80),
  -- TODO(owner): confirm restroom and water points near the hall.
  ('Restrooms and drinking water', 'practical', 'Volunteers can point you to the nearest restrooms and drinking water.', NULL, 90),
  -- TODO(owner): confirm the pick-up point for taxis and ride-hailing, and parking.
  ('Pick-up and parking', 'practical', 'Where to wait for a taxi or ride-hailing car, and where to park if you drive.', NULL, 100);