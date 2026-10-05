import { eventInputSchema, issuesToFields } from "@chronodle/shared";
import { describe, expect, it } from "vitest";
import { SEED_EVENTS } from "./seed-events";

describe("seed events", () => {
  it("has enough events with unique ids and dates", () => {
    expect(SEED_EVENTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SEED_EVENTS.map((e) => e.id)).size).toBe(SEED_EVENTS.length);
    expect(new Set(SEED_EVENTS.map((e) => e.date)).size).toBe(SEED_EVENTS.length);
  });

  it.each(SEED_EVENTS.map((event) => [event.id, event] as const))("%s passes the shared schema", (_id, event) => {
    const result = eventInputSchema.safeParse(event);
    expect(result.success ? {} : issuesToFields(result.error)).toEqual({});
  });
});
