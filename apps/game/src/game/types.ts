export { GENRES, type Genre, type HistoricalEvent } from "@chronodle/shared";
import type { HistoricalEvent } from "@chronodle/shared";

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
