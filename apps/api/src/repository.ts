import {
  compareEventDates,
  type AdminEvent,
  type EventInput,
  type EventPatch,
  type Genre,
  type HistoricalEvent,
} from "@chronodle/shared";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { events, type EventRow } from "./db/schema";

export interface EventRepository {
  /** Enabled events in the public shape (no admin fields). */
  listEnabled(): Promise<HistoricalEvent[]>;
  /** Every event, earliest first. */
  listAll(): Promise<AdminEvent[]>;
  create(input: EventInput): Promise<AdminEvent>;
  /** Null when no event has this id. */
  update(id: string, patch: EventPatch): Promise<AdminEvent | null>;
  /** False when no event has this id. */
  remove(id: string): Promise<boolean>;
}

/** An id or date that another event already uses. */
export class ConflictError extends Error {
  readonly field: "id" | "date";
  readonly existingId: string;

  constructor(field: "id" | "date", existingId: string) {
    super(
      field === "id"
        ? `An event with id "${existingId}" already exists`
        : `Another event ("${existingId}") already has this date`,
    );
    this.name = "ConflictError";
    this.field = field;
    this.existingId = existingId;
  }
}

interface EventFields {
  id: string;
  name: string;
  description: string;
  date: string;
  wikipedia: string;
  genre?: string | null;
}

/** The public event shape; a missing or null genre is omitted. */
export function toPublicEvent({ id, name, description, date, wikipedia, genre }: EventFields): HistoricalEvent {
  const event: HistoricalEvent = { id, name, description, date, wikipedia };
  if (genre) event.genre = genre as Genre;
  return event;
}

function toAdminEvent(row: EventRow): AdminEvent {
  return {
    ...toPublicEvent(row),
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Text dates don't sort BC correctly in SQL, so order in code.
const byDate = (a: { date: string }, b: { date: string }) => compareEventDates(a.date, b.date);

/** The violated unique constraint's name, or null if `error` isn't a unique violation. */
function uniqueViolation(error: unknown): string | null {
  // Drizzle wraps driver errors; the pg error (code 23505) is somewhere in the cause chain.
  let current: unknown = error;
  while (current && typeof current === "object") {
    const { code, constraint, cause } = current as { code?: string; constraint?: string; cause?: unknown };
    if (code === "23505") return constraint ?? "";
    current = cause;
  }
  return null;
}

export function createPgEventRepository(db: Db): EventRepository {
  async function rethrowConflict(error: unknown, attempted: { id?: string; date?: string }): Promise<never> {
    const constraint = uniqueViolation(error);
    if (constraint === "events_pkey" && attempted.id) throw new ConflictError("id", attempted.id);
    if (constraint === "events_date_unique" && attempted.date) {
      const [existing] = await db.select({ id: events.id }).from(events).where(eq(events.date, attempted.date));
      throw new ConflictError("date", existing?.id ?? "unknown");
    }
    throw error;
  }

  return {
    async listEnabled() {
      const rows = await db.select().from(events).where(eq(events.enabled, true));
      return rows.sort(byDate).map(toPublicEvent);
    },

    async listAll() {
      const rows = await db.select().from(events);
      return rows.sort(byDate).map(toAdminEvent);
    },

    async create(input) {
      try {
        const [row] = await db
          .insert(events)
          .values({ ...input, genre: input.genre ?? null })
          .returning();
        return toAdminEvent(row);
      } catch (error) {
        return rethrowConflict(error, input);
      }
    },

    async update(id, patch) {
      try {
        const [row] = await db
          .update(events)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(events.id, id))
          .returning();
        return row ? toAdminEvent(row) : null;
      } catch (error) {
        return rethrowConflict(error, patch);
      }
    },

    async remove(id) {
      const rows = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
      return rows.length > 0;
    },
  };
}
