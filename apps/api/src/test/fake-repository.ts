import { compareEventDates, type AdminEvent } from "@chronodle/shared";
import { ConflictError, toPublicEvent, type EventRepository } from "../repository";

/** In-memory EventRepository with the same uniqueness rules as Postgres. */
export function createFakeEventRepository(initial: AdminEvent[] = []): EventRepository {
  const rows = new Map(initial.map((event) => [event.id, { ...event }]));
  const sorted = () => [...rows.values()].sort((a, b) => compareEventDates(a.date, b.date));

  function assertDateFree(date: string, exceptId?: string) {
    for (const row of rows.values()) {
      if (row.date === date && row.id !== exceptId) throw new ConflictError("date", row.id);
    }
  }

  return {
    async listEnabled() {
      return sorted().filter((row) => row.enabled).map(toPublicEvent);
    },

    async listAll() {
      return sorted().map((row) => ({ ...row }));
    },

    async create(input) {
      if (rows.has(input.id)) throw new ConflictError("id", input.id);
      assertDateFree(input.date);
      const now = new Date().toISOString();
      const event: AdminEvent = { ...toPublicEvent(input), enabled: input.enabled, createdAt: now, updatedAt: now };
      rows.set(event.id, event);
      return { ...event };
    },

    async update(id, patch) {
      const existing = rows.get(id);
      if (!existing) return null;
      if (patch.date !== undefined) assertDateFree(patch.date, id);
      const merged = { ...existing, ...patch };
      const event: AdminEvent = {
        ...toPublicEvent(merged),
        enabled: merged.enabled,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      rows.set(id, event);
      return { ...event };
    },

    async remove(id) {
      return rows.delete(id);
    },
  };
}
