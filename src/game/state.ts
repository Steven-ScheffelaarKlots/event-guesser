import { evaluateGuess } from "./evaluate";
import type { GameState, Puzzle, Slot } from "./types";

export type GameAction =
  /** Put an event into a position. Occupied positions shift toward the nearest gap. */
  | { type: "place"; eventId: string; index: number }
  /** Put an event into the first empty position. */
  | { type: "placeNext"; eventId: string }
  /** Move a placed event from one position to another, shifting the ones between. */
  | { type: "move"; from: number; to: number }
  /** Take an event out of the current guess. */
  | { type: "remove"; eventId: string }
  | { type: "clear" }
  | { type: "submit" }
  | { type: "newGame"; puzzle: Puzzle };

export function createGameState(puzzle: Puzzle): GameState {
  return {
    puzzle,
    slots: emptySlots(puzzle.solution.length),
    history: [],
    status: "playing",
  };
}

export function emptySlots(size: number): Slot[] {
  return Array.from({ length: size }, () => null);
}

export function isGuessComplete(slots: readonly Slot[]): slots is string[] {
  return slots.every((slot) => slot !== null);
}

/**
 * Inserts `eventId` at `index`. If that position is taken, the cards between it
 * and the nearest empty position slide over by one to make room.
 */
export function insertIntoSlots(slots: readonly Slot[], eventId: string, index: number): Slot[] {
  if (slots.includes(eventId) || index < 0 || index >= slots.length) return [...slots];
  if (slots[index] === null) {
    return slots.map((slot, i) => (i === index ? eventId : slot));
  }

  let nearestGap = -1;
  slots.forEach((slot, i) => {
    if (slot !== null) return;
    if (nearestGap === -1 || Math.abs(i - index) < Math.abs(nearestGap - index)) nearestGap = i;
  });
  if (nearestGap === -1) return [...slots];

  const next = [...slots];
  next.splice(nearestGap, 1);
  next.splice(index, 0, eventId);
  return next;
}

export function moveInSlots(slots: readonly Slot[], from: number, to: number): Slot[] {
  const next = [...slots];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === "newGame") return createGameState(action.puzzle);
  if (state.status !== "playing") return state;

  switch (action.type) {
    case "place":
      if (!state.puzzle.solution.includes(action.eventId)) return state;
      return { ...state, slots: insertIntoSlots(state.slots, action.eventId, action.index) };

    case "placeNext": {
      const index = state.slots.indexOf(null);
      if (index === -1 || !state.puzzle.solution.includes(action.eventId)) return state;
      return { ...state, slots: insertIntoSlots(state.slots, action.eventId, index) };
    }

    case "move": {
      const { from, to } = action;
      const size = state.slots.length;
      if (from === to || from < 0 || to < 0 || from >= size || to >= size) return state;
      if (state.slots[from] === null) return state;
      return { ...state, slots: moveInSlots(state.slots, from, to) };
    }

    case "remove":
      return {
        ...state,
        slots: state.slots.map((slot) => (slot === action.eventId ? null : slot)),
      };

    case "clear":
      return { ...state, slots: emptySlots(state.slots.length) };

    case "submit": {
      if (!isGuessComplete(state.slots)) return state;
      const result = evaluateGuess(state.slots, state.puzzle.solution);
      return {
        ...state,
        history: [...state.history, result],
        slots: emptySlots(state.slots.length),
        status: result.isCorrect ? "won" : "playing",
      };
    }
  }
}
