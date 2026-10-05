import type { HistoricalEvent } from "@chronodle/shared";
import { useCallback, useEffect, useState } from "react";
import { fetchEvents } from "../api";

export type EventBank =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; events: HistoricalEvent[] };

/** Fetches the event bank once per page load; `retry` fetches again. */
export function useEventBank() {
  const [bank, setBank] = useState<EventBank>({ status: "loading" });

  const load = useCallback(() => {
    setBank({ status: "loading" });
    fetchEvents().then(
      (events) => setBank({ status: "ready", events }),
      (error: unknown) =>
        setBank({ status: "error", error: error instanceof Error ? error.message : String(error) }),
    );
  }, []);

  useEffect(load, [load]);

  return { bank, retry: load };
}
