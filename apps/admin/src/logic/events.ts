import { compareEventDates, type AdminEvent, type Genre } from "@chronodle/shared";

export type GenreFilter = "all" | "untagged" | Genre;
export type StatusFilter = "all" | "enabled" | "disabled";

export interface Filters {
  search: string;
  genre: GenreFilter;
  status: StatusFilter;
}

export const DEFAULT_FILTERS: Filters = { search: "", genre: "all", status: "all" };

export function filterEvents(events: readonly AdminEvent[], { search, genre, status }: Filters): AdminEvent[] {
  const needle = search.trim().toLowerCase();
  return events.filter(
    (event) =>
      (status === "all" || event.enabled === (status === "enabled")) &&
      (genre === "all" || (genre === "untagged" ? !event.genre : event.genre === genre)) &&
      (!needle || [event.name, event.description, event.id].some((text) => text.toLowerCase().includes(needle))),
  );
}

export type SortKey = "date" | "name" | "genre";

export interface Sort {
  key: SortKey;
  direction: "asc" | "desc";
}

export const DEFAULT_SORT: Sort = { key: "date", direction: "asc" };

type Compare = (a: AdminEvent, b: AdminEvent) => number;

const byDate: Compare = (a, b) => compareEventDates(a.date, b.date);
const byName: Compare = (a, b) => a.name.localeCompare(b.name) || byDate(a, b);
const byGenre: Compare = (a, b) => {
  if (a.genre === b.genre) return byDate(a, b);
  if (!a.genre) return 1; // untagged last
  if (!b.genre) return -1;
  return a.genre.localeCompare(b.genre);
};

const COMPARATORS: Record<SortKey, Compare> = { date: byDate, name: byName, genre: byGenre };

export function sortEvents(events: readonly AdminEvent[], { key, direction }: Sort): AdminEvent[] {
  const sorted = [...events].sort(COMPARATORS[key]);
  return direction === "asc" ? sorted : sorted.reverse();
}

/** Clicking the active column flips its direction; another column starts ascending. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: "asc" };
}
