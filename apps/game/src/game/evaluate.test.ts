import { describe, expect, it } from "vitest";
import { evaluateGuess } from "./evaluate";

const solution = ["A", "B", "C", "D", "E"];

describe("evaluateGuess", () => {
  it("marks a perfect guess as correct", () => {
    const result = evaluateGuess(solution, solution);
    expect(result.isCorrect).toBe(true);
    expect(result.positions.every((p) => p.feedback === "correct")).toBe(true);
  });

  it("matches the example from the spec", () => {
    const result = evaluateGuess(["A", "C", "B", "E", "D"], solution);
    expect(result.positions.map((p) => p.feedback)).toEqual(["correct", "near", "near", "near", "near"]);
    expect(result.isCorrect).toBe(false);
  });

  it("marks events more than one position away as far", () => {
    const result = evaluateGuess(["B", "A", "D", "C", "E"], solution);
    expect(result.positions.map((p) => p.feedback)).toEqual(["near", "near", "near", "near", "correct"]);

    const reversed = evaluateGuess(["E", "D", "C", "B", "A"], solution);
    expect(reversed.positions.map((p) => [p.eventId, p.distance, p.feedback])).toEqual([
      ["E", 4, "far"],
      ["D", 2, "far"],
      ["C", 0, "correct"],
      ["B", 2, "far"],
      ["A", 4, "far"],
    ]);
  });

  it("rejects duplicates, unknown events and wrong lengths", () => {
    expect(() => evaluateGuess(["A", "A", "C", "D", "E"], solution)).toThrow();
    expect(() => evaluateGuess(["A", "B", "C", "D", "Z"], solution)).toThrow();
    expect(() => evaluateGuess(["A", "B"], solution)).toThrow();
  });
});
