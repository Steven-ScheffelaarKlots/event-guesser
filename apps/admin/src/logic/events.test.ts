import type { AdminEvent } from "@chronodle/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filterEvents, nextSort, sortEvents } from "./events";

function make(id: string, date: string, extra: Partial<AdminEvent> = {}): AdminEvent {
  return {
    id,
    name: id,
    description: `About ${id}`,
    date,
    wikipedia: `https://en.wikipedia.org/wiki/${id}`,
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const events = [
  make("moon", "1969-07-20", { name: "Moon landing", genre: "exploration" }),
  make("caesar", "-0044-03-15", { name: "Caesar assassinated", genre: "politics", enabled: false }),
  make("hastings", "1066-10-14", { name: "Battle of Hastings", genre: "war", description: "Norman conquest begins" }),
  make("web", "1991-08-06", { name: "First website online" }),
];

const ids = (list: AdminEvent[]) => list.map((e) => e.id);

describe("filterEvents", () => {
  it("keeps everything with the default filters", () => {
    expect(ids(filterEvents(events, DEFAULT_FILTERS))).toEqual(["moon", "caesar", "hastings", "web"]);
  });

  it("searches name, description and id, ignoring case and surrounding spaces", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, search: "BATTLE" }))).toEqual(["hastings"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, search: " norman " }))).toEqual(["hastings"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, search: "caes" }))).toEqual(["caesar"]);
  });

  it("filters by genre, including untagged", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, genre: "war" }))).toEqual(["hastings"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, genre: "untagged" }))).toEqual(["web"]);
  });

  it("filters by status", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, status: "disabled" }))).toEqual(["caesar"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, status: "enabled" }))).toEqual(["moon", "hastings", "web"]);
  });

  it("combines filters", () => {
    expect(ids(filterEvents(events, { search: "o", genre: "politics", status: "enabled" }))).toEqual([]);
  });
});

describe("sortEvents", () => {
  it("sorts by date with BC first, and reverses for desc", () => {
    expect(ids(sortEvents(events, { key: "date", direction: "asc" }))).toEqual(["caesar", "hastings", "moon", "web"]);
    expect(ids(sortEvents(events, { key: "date", direction: "desc" }))).toEqual(["web", "moon", "hastings", "caesar"]);
  });

  it("sorts by name", () => {
    expect(ids(sortEvents(events, { key: "name", direction: "asc" }))).toEqual(["hastings", "caesar", "web", "moon"]);
  });

  it("sorts by genre with untagged events last", () => {
    expect(ids(sortEvents(events, { key: "genre", direction: "asc" }))).toEqual(["moon", "caesar", "hastings", "web"]);
  });

  it("does not mutate its input", () => {
    const copy = [...events];
    sortEvents(events, { key: "name", direction: "asc" });
    expect(events).toEqual(copy);
  });
});

describe("nextSort", () => {
  it("flips direction on the same column and starts ascending on a new one", () => {
    expect(nextSort({ key: "date", direction: "asc" }, "date")).toEqual({ key: "date", direction: "desc" });
    expect(nextSort({ key: "date", direction: "desc" }, "name")).toEqual({ key: "name", direction: "asc" });
  });
});
