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

/** One round of the game: the events to order and the correct answer. */
export interface Puzzle {
  /** Events in the order they are shown in the "Available events" row. */
  events: HistoricalEvent[];
  /** Event ids in correct chronological order (earliest first). */
  solution: string[];
}

/** How close a guessed position is to the correct one. */
export type Feedback = "correct" | "near" | "far";

export interface PositionResult {
  eventId: string;
  /** Absolute distance between guessed and correct position. */
  distance: number;
  feedback: Feedback;
}

export interface GuessResult {
  positions: PositionResult[];
  isCorrect: boolean;
}

/** A guess slot is either empty or holds an event id. */
export type Slot = string | null;

export type GameStatus = "playing" | "won";

export interface GameState {
  puzzle: Puzzle;
  /** The guess currently being built, one entry per position. */
  slots: Slot[];
  /** Submitted guesses, oldest first. */
  history: GuessResult[];
  status: GameStatus;
}
