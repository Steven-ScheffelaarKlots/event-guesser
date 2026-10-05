import { describe, expect, it } from "vitest";
import { FIXTURE_EVENTS } from "./test-fixtures";
import { compareEventDates } from "@chronodle/shared";
import { createRandomPuzzle, puzzleFromEvents } from "./generate";

/** Small deterministic generator so tests are repeatable. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("createRandomPuzzle", () => {
  it("picks 5 unique events with a chronological solution", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const puzzle = createRandomPuzzle(FIXTURE_EVENTS, { random: seeded(seed) });
      const ids = puzzle.events.map((e) => e.id);
      expect(new Set(ids).size).toBe(5);
      expect([...puzzle.solution].sort()).toEqual([...ids].sort());

      const dates = puzzle.solution.map((id) => FIXTURE_EVENTS.find((e) => e.id === id)!.date);
      for (let i = 1; i < dates.length; i++) {
        expect(compareEventDates(dates[i - 1], dates[i])).toBeLessThan(0);
      }
      // Never presented already solved.
      expect(ids).not.toEqual(puzzle.solution);
    }
  });

  it("supports other puzzle sizes and rejects banks that are too small", () => {
    expect(createRandomPuzzle(FIXTURE_EVENTS, { size: 7 }).events).toHaveLength(7);
    expect(() => createRandomPuzzle(FIXTURE_EVENTS.slice(0, 3))).toThrow();
  });

  it("reshuffles when the shuffle lands on the solution", () => {
    const sorted = [...FIXTURE_EVENTS].sort((a, b) => compareEventDates(a.date, b.date)).slice(0, 5);
    // random() === 0.999 makes Fisher–Yates keep the original (solved) order every time
    // until we switch to a different value.
    let calls = 0;
    const puzzle = puzzleFromEvents(sorted, () => (calls++ < 4 ? 0.999 : 0));
    expect(puzzle.events.map((e) => e.id)).not.toEqual(puzzle.solution);
  });
});
