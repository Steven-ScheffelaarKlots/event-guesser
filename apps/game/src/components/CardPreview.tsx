import type { HistoricalEvent } from "../game/types";

/** The card that follows the pointer while dragging. */
export function CardPreview({ event, fromPool }: { event: HistoricalEvent; fromPool: boolean }) {
  return (
    <div className={`drag-preview${fromPool ? " drag-preview--pool" : ""}`}>
      <div className="guess-card guess-card--lifted">
        <span className="guess-card__title">{event.name}</span>
      </div>
    </div>
  );
}
