import type { Feedback, GuessResult } from "./types";

export function feedbackForDistance(distance: number): Feedback {
  if (distance === 0) return "correct";
  if (distance === 1) return "near";
  return "far";
}

/**
 * Scores a complete guess against the solution. Each position is graded by how
 * far the guessed event sits from its correct position.
 */
export function evaluateGuess(guess: readonly string[], solution: readonly string[]): GuessResult {
  if (guess.length !== solution.length) {
    throw new Error(`Guess has ${guess.length} events, expected ${solution.length}`);
  }
  if (new Set(guess).size !== guess.length) {
    throw new Error("Guess contains the same event more than once");
  }

  const positions = guess.map((eventId, index) => {
    const correctIndex = solution.indexOf(eventId);
    if (correctIndex === -1) {
      throw new Error(`Event "${eventId}" is not part of this puzzle`);
    }
    const distance = Math.abs(index - correctIndex);
    return { eventId, distance, feedback: feedbackForDistance(distance) };
  });

  return { positions, isCorrect: positions.every((p) => p.feedback === "correct") };
}
