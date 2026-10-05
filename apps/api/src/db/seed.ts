import type { HistoricalEvent } from "@chronodle/shared";
import type { Db } from "./client";
import { events } from "./schema";
import { SEED_EVENTS } from "./seed-events";

/**
 * Inserts seed events. Any event whose id or date is already taken is skipped,
 * so admin edits survive and an admin-made event on a seed date doesn't block the rest.
 */
export async function seedEvents(
  db: Db,
  seed: readonly HistoricalEvent[] = SEED_EVENTS,
): Promise<{ inserted: number; skipped: number }> {
  const inserted = await db
    .insert(events)
    .values(seed.map((event) => ({ ...event, genre: event.genre ?? null })))
    .onConflictDoNothing()
    .returning({ id: events.id });
  return { inserted: inserted.length, skipped: seed.length - inserted.length };
}
