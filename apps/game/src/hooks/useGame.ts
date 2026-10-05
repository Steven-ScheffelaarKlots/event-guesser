import { useCallback, useReducer } from "react";
import { EVENTS } from "../data/events";
import { createRandomPuzzle } from "../game/generate";
import { createGameState, gameReducer } from "../game/state";
import type { HistoricalEvent } from "../game/types";

/**
 * Owns the game state. Puzzle creation lives here, outside the reducer, so a
 * daily/pre-generated puzzle source can replace `createRandomPuzzle` later.
 */
export function useGame(bank: readonly HistoricalEvent[] = EVENTS) {
  const [state, dispatch] = useReducer(gameReducer, bank, (b) =>
    createGameState(createRandomPuzzle(b)),
  );

  const newGame = useCallback(() => {
    dispatch({ type: "newGame", puzzle: createRandomPuzzle(bank) });
  }, [bank]);

  return { state, dispatch, newGame };
}
