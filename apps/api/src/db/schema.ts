import { GENRES } from "@chronodle/shared";
import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// GENRES is a fixed list of identifiers, so inlining it as SQL literals is safe.
const genreList = sql.raw(GENRES.map((genre) => `'${genre}'`).join(", "));

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    // "YYYY-MM-DD" / "-YYYY-MM-DD" text, not a Postgres date: see the design spec.
    date: text("date").notNull().unique(),
    wikipedia: text("wikipedia").notNull(),
    genre: text("genre"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("events_genre_check", sql`${table.genre} IN (${genreList})`)],
);

export type EventRow = typeof events.$inferSelect;
