import type { CSSProperties } from "react";
import type { Feedback, GuessResult, HistoricalEvent } from "../game/types";
import { FEEDBACK_META } from "./feedback";

interface GuessHistoryProps {
  history: GuessResult[];
  eventsById: Map<string, HistoricalEvent>;
}

const LEGEND_ORDER: Feedback[] = ["correct", "near", "far"];

export function GuessHistory({ history, eventsById }: GuessHistoryProps) {
  return (
    <section className="panel panel--history" aria-labelledby="history-heading">
      <div className="panel__head">
        <h2 id="history-heading">Guess history</h2>
        <ul className="legend" aria-label="Colour key">
          {LEGEND_ORDER.map((feedback) => (
            <li key={feedback} className={`legend__item tile--${feedback}`}>
              <span className="legend__swatch" aria-hidden="true">
                {FEEDBACK_META[feedback].symbol}
              </span>
              {FEEDBACK_META[feedback].label}
            </li>
          ))}
        </ul>
      </div>

      {history.length === 0 ? (
        <p className="history-empty">
          Submitted guesses land here. Each card is coloured by how far it sits from its true place.
        </p>
      ) : (
        <ol className="history">
          {history.map((guess, guessIndex) => (
            <li key={guessIndex} className="history__row">
              <span className="history__number" aria-label={`Guess ${guessIndex + 1}`}>
                {guessIndex + 1}
              </span>
              <ol className="history__tiles">
                {guess.positions.map((position, i) => {
                  const meta = FEEDBACK_META[position.feedback];
                  const title = eventsById.get(position.eventId)?.name ?? position.eventId;
                  return (
                    <li
                      key={position.eventId}
                      className={`tile tile--${position.feedback}`}
                      style={{ "--i": i } as CSSProperties}
                      aria-label={`Position ${i + 1}: ${title}, ${meta.label.toLowerCase()}`}
                    >
                      <span className="tile__title">{title}</span>
                      <span className="tile__symbol" aria-hidden="true">
                        {meta.symbol}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
