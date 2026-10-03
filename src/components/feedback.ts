import type { Feedback, GuessResult } from "../game/types";

export const FEEDBACK_META: Record<Feedback, { symbol: string; label: string; emoji: string }> = {
  correct: { symbol: "✓", label: "Right spot", emoji: "🟩" },
  near: { symbol: "~", label: "One spot off", emoji: "🟨" },
  far: { symbol: "✕", label: "Two or more off", emoji: "🟥" },
};

const SUMMARY_PHRASES: Record<Feedback, string> = {
  correct: "in the right spot",
  near: "one off",
  far: "further away",
};

/** e.g. "1 in the right spot, 4 one off". Zero counts are left out. */
export function summarizeGuess(result: GuessResult): string {
  return (Object.keys(SUMMARY_PHRASES) as Feedback[])
    .map((feedback) => [result.positions.filter((p) => p.feedback === feedback).length, feedback] as const)
    .filter(([count]) => count > 0)
    .map(([count, feedback]) => `${count} ${SUMMARY_PHRASES[feedback]}`)
    .join(", ");
}
