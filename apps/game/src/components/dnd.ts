import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";
import type { Slot } from "../game/types";

/**
 * Drag ids:
 * - Available cards drag as `pool:<eventId>` (they never leave the pool).
 * - Guess slots are sortable items: a placed event uses its event id, an empty
 *   position uses `empty:<n>`.
 * - The Available events section is a droppable (`pool`) for taking cards back.
 * - The guess row is a droppable (`guess-zone`) so drops in the gaps between
 *   slots still count.
 */
export const POOL_DROP_ID = "pool";
export const GUESS_ZONE_ID = "guess-zone";
const POOL_PREFIX = "pool:";

export const poolDragId = (eventId: string) => `${POOL_PREFIX}${eventId}`;

export function eventIdFromPoolDrag(id: string): string | null {
  return id.startsWith(POOL_PREFIX) ? id.slice(POOL_PREFIX.length) : null;
}

export function slotItemIds(slots: readonly Slot[]): string[] {
  let empty = 0;
  return slots.map((slot) => slot ?? `empty:${empty++}`);
}

const isSlotId = (id: string | number) => id !== POOL_DROP_ID && id !== GUESS_ZONE_ID;

/**
 * Prefer whatever is directly under the pointer. Cards from the pool only land
 * when released over the guess row; guess cards keep snapping to the closest
 * slot (so reordering stays smooth) unless they're over the pool. Keyboard drags
 * have no pointer, so they always use the closest slot.
 */
export const collisionDetection: CollisionDetection = (args) => {
  const fromPool = eventIdFromPoolDrag(String(args.active.id)) !== null;
  const slotContainers = args.droppableContainers.filter((c) => isSlotId(c.id));

  if (args.pointerCoordinates) {
    const hits = pointerWithin(args);
    const slotHit = hits.find((c) => isSlotId(c.id));
    if (slotHit) return [slotHit];

    const overPool = hits.some((c) => c.id === POOL_DROP_ID);
    if (overPool) return fromPool ? [] : hits.filter((c) => c.id === POOL_DROP_ID);

    const overGuessZone = hits.some((c) => c.id === GUESS_ZONE_ID);
    if (fromPool && !overGuessZone) return [];
  }

  return closestCenter({ ...args, droppableContainers: slotContainers });
};
