import type { HistoricalEvent } from "./types";

/** A small, stable event bank for game-logic tests. */
export const FIXTURE_EVENTS: HistoricalEvent[] = [
  ["caesar", "-0044-03-15"],
  ["hastings", "1066-10-14"],
  ["magna-carta", "1215-06-15"],
  ["columbus", "1492-10-12"],
  ["bastille", "1789-07-14"],
  ["titanic", "1912-04-15"],
  ["moon-landing", "1969-07-20"],
  ["berlin-wall", "1989-11-09"],
].map(([id, date]) => ({
  id,
  name: id,
  description: `Fixture event ${id}`,
  date,
  wikipedia: `https://en.wikipedia.org/wiki/${id}`,
}));
