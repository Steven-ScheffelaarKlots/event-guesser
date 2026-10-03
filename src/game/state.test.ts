import { describe, expect, it } from "vitest";
import { createGameState, gameReducer, insertIntoSlots } from "./state";
import type { Puzzle } from "./types";

const puzzle: Puzzle = {
  events: ["C", "A", "E", "B", "D"].map((id) => ({ id, name: id, description: "", date: "2000-01-01", wikipedia: "" })),
  solution: ["A", "B", "C", "D", "E"],
};

function play(...actions: Parameters<typeof gameReducer>[1][]) {
  return actions.reduce(gameReducer, createGameState(puzzle));
}

describe("insertIntoSlots", () => {
  it("fills an empty slot directly", () => {
    expect(insertIntoSlots([null, null, null], "A", 1)).toEqual([null, "A", null]);
  });

  it("shifts toward the nearest gap when the slot is taken", () => {
    expect(insertIntoSlots(["A", "B", null, null, null], "X", 0)).toEqual(["X", "A", "B", null, null]);
    expect(insertIntoSlots([null, "A", "B", "C", null], "X", 3)).toEqual([null, "A", "B", "X", "C"]);
    expect(insertIntoSlots([null, "A", "B", "C", "D"], "X", 3)).toEqual(["A", "B", "C", "X", "D"]);
  });

  it("ignores events that are already placed", () => {
    expect(insertIntoSlots(["A", null], "A", 1)).toEqual(["A", null]);
  });
});

describe("gameReducer", () => {
  it("places, moves, removes and clears", () => {
    let state = play({ type: "placeNext", eventId: "B" }, { type: "placeNext", eventId: "A" });
    expect(state.slots).toEqual(["B", "A", null, null, null]);

    state = gameReducer(state, { type: "move", from: 1, to: 0 });
    expect(state.slots).toEqual(["A", "B", null, null, null]);

    state = gameReducer(state, { type: "remove", eventId: "A" });
    expect(state.slots).toEqual([null, "B", null, null, null]);

    state = gameReducer(state, { type: "clear" });
    expect(state.slots).toEqual([null, null, null, null, null]);
  });

  it("does not submit an incomplete guess", () => {
    const state = play({ type: "placeNext", eventId: "A" }, { type: "submit" });
    expect(state.history).toHaveLength(0);
  });

  it("records a wrong guess and resets the guess row", () => {
    const state = play(
      ...["A", "C", "B", "E", "D"].map((eventId) => ({ type: "placeNext" as const, eventId })),
      { type: "submit" },
    );
    expect(state.history).toHaveLength(1);
    expect(state.history[0].positions.map((p) => p.feedback)).toEqual(["correct", "near", "near", "near", "near"]);
    expect(state.slots).toEqual([null, null, null, null, null]);
    expect(state.status).toBe("playing");
    // The available events never change.
    expect(state.puzzle).toBe(puzzle);
  });

  it("wins on a correct guess and then ignores edits", () => {
    let state = play(
      ...["A", "B", "C", "D", "E"].map((eventId) => ({ type: "placeNext" as const, eventId })),
      { type: "submit" },
    );
    expect(state.status).toBe("won");
    expect(state.history).toHaveLength(1);

    state = gameReducer(state, { type: "placeNext", eventId: "A" });
    expect(state.slots).toEqual([null, null, null, null, null]);
  });
});
