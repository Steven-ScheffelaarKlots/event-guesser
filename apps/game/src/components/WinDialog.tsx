import { useEffect, useRef } from "react";
import { formatEventDate } from "../game/dates";
import type { GameState } from "../game/types";
import { FEEDBACK_META } from "./feedback";

interface WinDialogProps {
  state: GameState;
  onNewGame: () => void;
}

export function WinDialog({ state, onNewGame }: WinDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const won = state.status === "won";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (won && !dialog.open) dialog.showModal();
    if (!won && dialog.open) dialog.close();
  }, [won]);

  const { puzzle, history } = state;
  const eventsById = new Map(puzzle.events.map((e) => [e.id, e]));
  const guesses = history.length;

  return (
    <dialog
      ref={ref}
      className="win"
      aria-labelledby="win-heading"
      onClick={(e) => {
        // Clicking the backdrop closes the dialog.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
    >
      {won && (
        <div className="win__body">
          <h2 id="win-heading" className="win__title">
            You win!
          </h2>
          <p className="win__summary">
            You put all {puzzle.solution.length} events in the right order in {guesses}{" "}
            {guesses === 1 ? "guess" : "guesses"}.
          </p>

          <div className="win__grid" aria-hidden="true">
            {history.map((guess, i) => (
              <div key={i}>{guess.positions.map((p) => FEEDBACK_META[p.feedback].emoji).join("")}</div>
            ))}
          </div>

          <ol className="win__timeline">
            {puzzle.solution.map((id) => {
              const event = eventsById.get(id)!;
              return (
                <li key={id}>
                  <span className="win__date">{formatEventDate(event.date)}</span>
                  <a className="win__event" href={event.wikipedia} target="_blank" rel="noreferrer">
                    {event.name}
                  </a>
                </li>
              );
            })}
          </ol>

          <div className="win__actions">
            <button type="button" className="button button--ghost" onClick={() => ref.current?.close()}>
              See the board
            </button>
            <button type="button" className="button button--primary" onClick={onNewGame} autoFocus>
              New game
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
