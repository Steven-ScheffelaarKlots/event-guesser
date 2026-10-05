/** Events per puzzle. The game needs at least this many enabled events. */
export const PUZZLE_SIZE = 5;

/** Broad categories for events. Listed in `GENRES` so they can be iterated. */
export const GENRES = [
  "politics",
  "war",
  "science",
  "technology",
  "exploration",
  "religion",
  "culture",
  "economy",
  "disaster",
] as const;

export type Genre = (typeof GENRES)[number];

/**
 * A single historical event from the event bank.
 *
 * `date` is an ISO-like "YYYY-MM-DD" string. Years before the common era use a
 * leading minus sign and mean "N BC" directly (no year zero), e.g. "-0044-03-15"
 * is 15 March 44 BC.
 */
export interface HistoricalEvent {
  id: string;
  name: string;
  description: string;
  date: string;
  /** Full URL of the English Wikipedia article about the event. */
  wikipedia: string;
  genre?: Genre;
}

/** An event as the admin API returns it. Timestamps are ISO 8601 strings. */
export type AdminEvent = HistoricalEvent & {
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
