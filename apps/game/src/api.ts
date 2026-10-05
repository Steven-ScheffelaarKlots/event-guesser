import type { HistoricalEvent } from "@chronodle/shared";

export async function fetchEvents(): Promise<HistoricalEvent[]> {
  let response: Response;
  try {
    response = await fetch("/api/events");
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  if (!response.ok) throw new Error(`The server returned an error (HTTP ${response.status}).`);
  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) throw new Error("The server sent an unexpected response.");
  return body as HistoricalEvent[];
}
