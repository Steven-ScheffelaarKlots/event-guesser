import { useDraggable, useDroppable } from "@dnd-kit/core";
import { formatEventDate } from "@chronodle/shared";
import type { HistoricalEvent, Slot } from "../game/types";
import { POOL_DROP_ID, poolDragId } from "./dnd";

interface AvailableEventsProps {
  events: HistoricalEvent[];
  slots: readonly Slot[];
  locked: boolean;
  revealDates: boolean;
  /** True while a guess card is being dragged, so this area can take it back. */
  acceptsReturn: boolean;
  onToggle: (eventId: string, placed: boolean) => void;
}

/** The fixed reference row. Cards stay here for the whole game; placing one only marks it. */
export function AvailableEvents({ events, slots, locked, revealDates, acceptsReturn, onToggle }: AvailableEventsProps) {
  const { setNodeRef, isOver } = useDroppable({ id: POOL_DROP_ID });
  const returning = acceptsReturn && isOver;

  return (
    <section
      ref={setNodeRef}
      className={`panel panel--pool${acceptsReturn ? " is-accepting" : ""}${returning ? " is-over" : ""}`}
      aria-labelledby="pool-heading"
    >
      <div className="panel__head">
        <h2 id="pool-heading">Available events</h2>
        <p className="panel__hint">
          {locked
            ? "Here's when each one happened."
            : returning
              ? "Release to take it out of your guess."
              : "Tap a card or drag it into your guess."}
        </p>
      </div>

      <ul className="pool">
        {events.map((event) => {
          const index = slots.indexOf(event.id);
          return (
            <li key={event.id}>
              <AvailableCard
                event={event}
                position={index === -1 ? null : index + 1}
                locked={locked}
                revealDate={revealDates}
                onToggle={() => onToggle(event.id, index !== -1)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface AvailableCardProps {
  event: HistoricalEvent;
  /** 1-based position in the current guess, or null if not placed. */
  position: number | null;
  locked: boolean;
  revealDate: boolean;
  onToggle: () => void;
}

function AvailableCard({ event, position, locked, revealDate, onToggle }: AvailableCardProps) {
  const placed = position !== null;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: poolDragId(event.id),
    disabled: placed || locked,
  });
  // Keyboard users place cards with Enter/Space (a click), so skip the keyboard drag handler.
  const { onKeyDown: _keyboardDrag, ...pointerListeners } = listeners ?? {};

  const status = locked ? "" : placed ? `In position ${position}. Select to remove.` : "Select to add to your guess.";

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`event-card${placed ? " is-placed" : ""}${isDragging ? " is-drag-source" : ""}`}
      aria-disabled={locked || undefined}
      onClick={locked ? undefined : onToggle}
      {...pointerListeners}
    >
      <span className="event-card__title">{event.name}</span>
      <span className="event-card__desc">{event.description}</span>
      {revealDate && <span className="event-card__date">{formatEventDate(event.date)}</span>}
      {placed && (
        <span className="event-card__badge" aria-hidden="true" key={position}>
          {position}
        </span>
      )}
      {status && <span className="visually-hidden">{status}</span>}
    </button>
  );
}
