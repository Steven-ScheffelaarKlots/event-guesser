import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import { snapCenterToCursor } from "@dnd-kit/modifiers";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMemo, useRef, useState, type Dispatch } from "react";
import type { GameAction } from "../game/state";
import type { GameState, HistoricalEvent } from "../game/types";
import { AvailableEvents } from "./AvailableEvents";
import { CardPreview } from "./CardPreview";
import { collisionDetection, eventIdFromPoolDrag, POOL_DROP_ID, slotItemIds } from "./dnd";
import { GuessHistory } from "./GuessHistory";
import { GuessRow } from "./GuessRow";

interface BoardProps {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  onNewGame: () => void;
}

export function Board({ state, dispatch, onNewGame }: BoardProps) {
  const { puzzle, slots, history, status } = state;
  const locked = status !== "playing";
  const itemIds = slotItemIds(slots);
  const [activeId, setActiveId] = useState<string | null>(null);

  const eventsById = useMemo(
    () => new Map<string, HistoricalEvent>(puzzle.events.map((e) => [e.id, e])),
    [puzzle],
  );

  // A drag that ends over a card also fires a click on it; ignore that click.
  const justDragged = useRef(false);
  const markDragged = () => {
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
  };
  const unlessJustDragged = (fn: () => void) => {
    if (!justDragged.current) fn();
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Press-and-hold on touch so the page can still scroll normally.
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const draggedEventId = activeId ? (eventIdFromPoolDrag(activeId) ?? activeId) : null;
  const draggedEvent = draggedEventId ? eventsById.get(draggedEventId) : undefined;
  const draggingFromPool = activeId !== null && eventIdFromPoolDrag(activeId) !== null;

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    markDragged();
    if (!over) return;

    const dragged = String(active.id);
    const target = String(over.id);
    const poolEventId = eventIdFromPoolDrag(dragged);

    if (poolEventId) {
      const index = itemIds.indexOf(target);
      if (index !== -1) dispatch({ type: "place", eventId: poolEventId, index });
      return;
    }
    if (target === POOL_DROP_ID) {
      dispatch({ type: "remove", eventId: dragged });
      return;
    }
    const from = itemIds.indexOf(dragged);
    const to = itemIds.indexOf(target);
    if (from !== -1 && to !== -1) dispatch({ type: "move", from, to });
  };

  const announcements = useMemo<Announcements>(() => {
    const title = (id: string | number) => {
      const eventId = eventIdFromPoolDrag(String(id)) ?? String(id);
      return eventsById.get(eventId)?.name ?? "card";
    };
    const describeTarget = (id: string | number) => {
      if (id === POOL_DROP_ID) return "available events, release to remove it from your guess";
      const index = itemIds.indexOf(String(id));
      return index === -1 ? "nothing" : `position ${index + 1} of ${itemIds.length}`;
    };
    return {
      onDragStart: ({ active }) => `Picked up ${title(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over ? `${title(active.id)} is over ${describeTarget(over.id)}.` : `${title(active.id)} is not over a position.`,
      onDragEnd: ({ active, over }) =>
        over ? `${title(active.id)} dropped on ${describeTarget(over.id)}.` : `${title(active.id)} returned.`,
      onDragCancel: ({ active }) => `Cancelled. ${title(active.id)} returned.`,
    };
  }, [eventsById, itemIds]);

  const overlayModifiers: Modifier[] = draggingFromPool ? [snapCenterToCursor] : [];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements }}
    >
      <div className="board">
        <AvailableEvents
          events={puzzle.events}
          slots={slots}
          locked={locked}
          revealDates={status === "won"}
          acceptsReturn={activeId !== null && !draggingFromPool}
          onToggle={(eventId, placed) =>
            unlessJustDragged(() =>
              dispatch(placed ? { type: "remove", eventId } : { type: "placeNext", eventId }),
            )
          }
        />

        <GuessRow
          itemIds={itemIds}
          eventsById={eventsById}
          locked={locked}
          draggingFromPool={draggingFromPool}
          guessCount={history.length}
          lastResult={history.at(-1)}
          onRemove={(eventId) => unlessJustDragged(() => dispatch({ type: "remove", eventId }))}
          onClear={() => dispatch({ type: "clear" })}
          onSubmit={() => dispatch({ type: "submit" })}
          onNewGame={onNewGame}
        />

        <GuessHistory history={history} eventsById={eventsById} />
      </div>

      <DragOverlay modifiers={overlayModifiers} dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {draggedEvent ? <CardPreview event={draggedEvent} fromPool={draggingFromPool} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
