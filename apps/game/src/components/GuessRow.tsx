import { useDroppable } from "@dnd-kit/core";
import {
  defaultAnimateLayoutChanges,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { GuessResult, HistoricalEvent } from "../game/types";
import { GUESS_ZONE_ID } from "./dnd";
import { summarizeGuess } from "./feedback";

interface GuessRowProps {
  itemIds: string[];
  eventsById: Map<string, HistoricalEvent>;
  locked: boolean;
  draggingFromPool: boolean;
  guessCount: number;
  lastResult: GuessResult | undefined;
  onRemove: (eventId: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  onNewGame: () => void;
}

export function GuessRow({
  itemIds,
  eventsById,
  locked,
  draggingFromPool,
  guessCount,
  lastResult,
  onRemove,
  onClear,
  onSubmit,
  onNewGame,
}: GuessRowProps) {
  const { setNodeRef } = useDroppable({ id: GUESS_ZONE_ID, disabled: locked });
  const placedCount = itemIds.filter((id) => eventsById.has(id)).length;
  const complete = placedCount === itemIds.length;

  return (
    <section className={`panel panel--guess${draggingFromPool ? " is-accepting" : ""}`} aria-labelledby="guess-heading">
      <div className="panel__head">
        <h2 id="guess-heading">Your guess</h2>
        <p className="panel__hint">
          {locked ? "Solved." : "Earliest on the left. Drag to reorder, tap to remove."}
        </p>
      </div>

      <div ref={setNodeRef} className="timeline">
        <SortableContext items={itemIds} strategy={horizontalListSortingStrategy}>
          <ol className="timeline__slots" aria-label="Guess positions, earliest first">
            {itemIds.map((id, index) => (
              <GuessSlot
                key={id}
                id={id}
                index={index}
                event={eventsById.get(id)}
                locked={locked}
                onRemove={onRemove}
              />
            ))}
          </ol>
        </SortableContext>

        <div className="timeline__rail" aria-hidden="true">
          {itemIds.map((_, index) => (
            <span key={index} className="timeline__tick">
              {index + 1}
            </span>
          ))}
        </div>
        <div className="timeline__ends" aria-hidden="true">
          <span>Earliest</span>
          <span>Latest</span>
        </div>
      </div>

      {locked ? (
        <div className="guess-actions guess-actions--done">
          <p className="guess-status">
            Solved in {guessCount} {guessCount === 1 ? "guess" : "guesses"}.
          </p>
          <button type="button" className="button button--primary" onClick={onNewGame}>
            New game
          </button>
        </div>
      ) : (
        <div className="guess-actions">
          <p className="guess-status" aria-live="polite" key={guessCount}>
            {lastResult ? `Not quite. Guess ${guessCount}: ${summarizeGuess(lastResult)}.` : ""}
          </p>
          <div className="guess-actions__buttons">
            <button type="button" className="button button--ghost" onClick={onClear} disabled={placedCount === 0}>
              Clear
            </button>
            <button type="button" className="button button--primary" onClick={onSubmit} disabled={!complete}>
              {complete ? "Submit guess" : `Place ${itemIds.length - placedCount} more`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// Animate every reorder, including cards shifted by a drop from the pool.
const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

interface GuessSlotProps {
  id: string;
  index: number;
  event: HistoricalEvent | undefined;
  locked: boolean;
  onRemove: (eventId: string) => void;
}

function GuessSlot({ id, index, event, locked, onRemove }: GuessSlotProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver, active } = useSortable({
    id,
    // Empty positions are drop targets only; nothing can move once the game is solved.
    disabled: { draggable: !event || locked, droppable: locked },
    animateLayoutChanges,
  });

  const style = { transform: CSS.Translate.toString(transform), transition };
  const showDropTarget = isOver && active?.id !== id;

  if (!event) {
    return (
      <li
        ref={setNodeRef}
        style={style}
        className={`slot slot--empty${showDropTarget ? " is-over" : ""}`}
        aria-label={`Position ${index + 1}, empty`}
      />
    );
  }

  return (
    <li ref={setNodeRef} style={style} className={`slot${isDragging ? " is-drag-source" : ""}`}>
      <div
        className={`guess-card${showDropTarget ? " is-over" : ""}`}
        {...attributes}
        {...listeners}
        aria-label={`Position ${index + 1}: ${event.name}. Space to move, Delete to remove.`}
        onClick={locked ? undefined : () => onRemove(event.id)}
        onKeyDown={(e) => {
          if (!locked && (e.key === "Delete" || e.key === "Backspace")) {
            e.preventDefault();
            onRemove(event.id);
            return;
          }
          listeners?.onKeyDown?.(e);
        }}
      >
        <span className="guess-card__title">{event.name}</span>
        {!locked && (
          <span className="guess-card__remove" aria-hidden="true">
            ×
          </span>
        )}
      </div>
    </li>
  );
}
