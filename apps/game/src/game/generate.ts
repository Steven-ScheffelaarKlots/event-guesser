import { compareEventDates, PUZZLE_SIZE } from "@chronodle/shared";
import type { HistoricalEvent, Puzzle } from "./types";

/** Returns a float in [0, 1). Swap in a seeded generator for daily puzzles. */
export type RandomSource = () => number;

export const DEFAULT_PUZZLE_SIZE = PUZZLE_SIZE;

export interface PuzzleOptions {
  size?: number;
  random?: RandomSource;
}

/** Fisher–Yates shuffle that returns a new array. */
export function shuffle<T>(items: readonly T[], random: RandomSource = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Event ids sorted earliest first. */
export function chronologicalIds(events: readonly HistoricalEvent[]): string[] {
  return [...events].sort((a, b) => compareEventDates(a.date, b.date)).map((e) => e.id);
}

/**
 * Builds a puzzle from a fixed set of events, shuffling the display order so it
 * never starts out already solved. Useful on its own once puzzles are
 * pre-generated (e.g. a daily set of ids).
 */
export function puzzleFromEvents(
  events: readonly HistoricalEvent[],
  random: RandomSource = Math.random,
): Puzzle {
  const solution = chronologicalIds(events);
  let display = shuffle(events, random);
  // With 2+ events a shuffle can land on the answer; reshuffle until it doesn't.
  for (let attempt = 0; events.length > 1 && attempt < 100; attempt++) {
    if (display.some((event, i) => event.id !== solution[i])) break;
    display = shuffle(events, random);
  }
  return { events: display, solution };
}

/** Picks `size` distinct random events from the bank and builds a puzzle. */
export function createRandomPuzzle(
  bank: readonly HistoricalEvent[],
  { size = DEFAULT_PUZZLE_SIZE, random = Math.random }: PuzzleOptions = {},
): Puzzle {
  if (bank.length < size) {
    throw new Error(`Event bank has ${bank.length} events, need at least ${size}`);
  }
  const picked = shuffle(bank, random).slice(0, size);
  return puzzleFromEvents(picked, random);
}
