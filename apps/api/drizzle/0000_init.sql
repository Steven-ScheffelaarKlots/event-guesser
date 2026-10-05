CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"date" text NOT NULL,
	"wikipedia" text NOT NULL,
	"genre" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_date_unique" UNIQUE("date"),
	CONSTRAINT "events_genre_check" CHECK ("events"."genre" IN ('politics', 'war', 'science', 'technology', 'exploration', 'religion', 'culture', 'economy', 'disaster'))
);
