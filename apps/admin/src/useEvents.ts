import type { AdminEvent, EventInput, EventPatch } from "@chronodle/shared";
import { useCallback, useEffect, useState } from "react";
import * as api from "./api";

/**
 * The admin's event list. Mutations go to the API first, and local state is
 * updated only from the server's response, so a failed call leaves the list
 * unchanged (e.g. a failed enable toggle simply stays where it was).
 */
export function useEvents() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      setEvents(await api.listEvents());
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const replace = (updated: AdminEvent) =>
    setEvents((list) => list.map((event) => (event.id === updated.id ? updated : event)));

  const create = useCallback(async (input: EventInput) => {
    const created = await api.createEvent(input);
    setEvents((list) => [...list, created]);
    return created;
  }, []);

  const update = useCallback(async (id: string, patch: EventPatch) => {
    const updated = await api.updateEvent(id, patch);
    replace(updated);
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteEvent(id);
    setEvents((list) => list.filter((event) => event.id !== id));
  }, []);

  return { events, status, error, reload, create, update, remove };
}
