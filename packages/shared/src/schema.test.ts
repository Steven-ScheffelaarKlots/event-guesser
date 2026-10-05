import { describe, expect, it } from "vitest";
import { eventInputSchema, eventPatchSchema, issuesToFields } from "./schema";

const valid = {
  id: "moon-landing",
  name: "Moon landing",
  description: "Apollo 11's crew walks on the Moon.",
  date: "1969-07-20",
  wikipedia: "https://en.wikipedia.org/wiki/Apollo_11",
  genre: "exploration",
};

describe("eventInputSchema", () => {
  it("accepts a valid event and defaults enabled to true", () => {
    expect(eventInputSchema.parse(valid)).toEqual({ ...valid, enabled: true });
  });

  it("trims text fields", () => {
    const parsed = eventInputSchema.parse({ ...valid, name: "  Moon landing  ", date: " 1969-07-20 " });
    expect(parsed.name).toBe("Moon landing");
    expect(parsed.date).toBe("1969-07-20");
  });

  it("allows the genre to be missing or null", () => {
    const withoutGenre: Record<string, unknown> = { ...valid };
    delete withoutGenre.genre;
    expect(eventInputSchema.safeParse(withoutGenre).success).toBe(true);
    expect(eventInputSchema.parse({ ...valid, genre: null }).genre).toBeNull();
  });

  it("accepts a 26-character name and a BC date", () => {
    expect(eventInputSchema.safeParse({ ...valid, name: "x".repeat(26), date: "-0044-03-15" }).success).toBe(true);
  });

  it.each([
    ["id", "Moon Landing"],
    ["id", "moon--landing"],
    ["id", "-moon"],
    ["id", "a".repeat(61)],
    ["name", ""],
    ["name", "   "],
    ["name", "x".repeat(27)],
    ["description", ""],
    ["description", "Apollo 11 lands in 1969."],
    ["description", "x".repeat(201)],
    ["date", "1969-7-20"],
    ["date", "1969-02-30"],
    ["date", "0000-01-01"],
    ["date", "July 1969"],
    ["wikipedia", "http://en.wikipedia.org/wiki/Apollo_11"],
    ["wikipedia", "https://en.m.wikipedia.org/wiki/Apollo_11"],
    ["wikipedia", "https://en.wikipedia.org/wiki/"],
    ["wikipedia", "https://example.com"],
    ["genre", "sports"],
    ["enabled", "yes"],
  ])("rejects %s = %j", (field, value) => {
    const result = eventInputSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(issuesToFields(result.error)).toHaveProperty(field);
  });
});

describe("eventPatchSchema", () => {
  it("accepts a partial patch", () => {
    expect(eventPatchSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it("strips id, which cannot be changed", () => {
    expect(eventPatchSchema.parse({ id: "renamed", name: "New name" })).toEqual({ name: "New name" });
  });

  it("allows clearing the genre", () => {
    expect(eventPatchSchema.parse({ genre: null })).toEqual({ genre: null });
  });

  it("rejects an empty patch, including one that only tries to change id", () => {
    for (const body of [{}, { id: "renamed" }]) {
      const result = eventPatchSchema.safeParse(body);
      expect(result.success).toBe(false);
      if (!result.success) expect(issuesToFields(result.error)).toHaveProperty("form");
    }
  });

  it("validates the fields it is given", () => {
    const result = eventPatchSchema.safeParse({ date: "1969-02-30" });
    expect(result.success).toBe(false);
    if (!result.success) expect(issuesToFields(result.error)).toHaveProperty("date");
  });
});

describe("issuesToFields", () => {
  it("keeps the first message per field", () => {
    const result = eventInputSchema.safeParse({ ...valid, name: "", description: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = issuesToFields(result.error);
      expect(Object.keys(fields).sort()).toEqual(["description", "name"]);
      expect(fields.name).toBe("Name is required");
    }
  });
});
