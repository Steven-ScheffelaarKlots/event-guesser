import type { AdminEvent } from "@chronodle/shared";
import { describe, expect, it } from "vitest";
import { datePreview, EMPTY_FORM, formFromEvent, validateForm, type FormValues } from "./form";

const values: FormValues = {
  id: "moon-landing",
  name: "Moon landing",
  description: "Apollo 11's crew walks on the Moon.",
  date: "1969-07-20",
  wikipedia: "https://en.wikipedia.org/wiki/Apollo_11",
  genre: "",
  enabled: true,
};

describe("validateForm", () => {
  it("turns an empty genre into null", () => {
    expect(validateForm(values)).toEqual({ ok: true, input: { ...values, genre: null } });
  });

  it("keeps a chosen genre", () => {
    const result = validateForm({ ...values, genre: "exploration" });
    expect(result.ok && result.input.genre).toBe("exploration");
  });

  it("returns errors keyed by field", () => {
    const result = validateForm({ ...values, name: "x".repeat(27), date: "1969-02-30" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["date", "name"]);
  });

  it("flags every required field on an empty form", () => {
    const result = validateForm(EMPTY_FORM);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["date", "description", "id", "name", "wikipedia"]);
    }
  });
});

describe("formFromEvent", () => {
  it("maps an event to form values that validate", () => {
    const event: AdminEvent = { ...values, genre: undefined, enabled: false, createdAt: "", updatedAt: "" };
    const form = formFromEvent(event);
    expect(form).toEqual({ ...values, enabled: false });
    expect(validateForm(form).ok).toBe(true);
  });
});

describe("datePreview", () => {
  it.each([
    ["1969-07-20", "20 July 1969"],
    ["-0044-03-15", "15 March 44 BC"],
    [" 1969-07-20 ", "20 July 1969"],
    ["1969-0", null],
    ["", null],
    ["1969-02-30", null],
  ])("%j → %j", (input, expected) => {
    expect(datePreview(input)).toBe(expected);
  });
});
