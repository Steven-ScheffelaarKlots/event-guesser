import { describe, expect, it } from "vitest";
import { compareEventDates, formatEventDate, parseEventDate } from "./dates";

describe("dates", () => {
  it("orders BC dates before AD dates and compares within a year", () => {
    expect(compareEventDates("-0044-03-15", "0476-09-04")).toBeLessThan(0);
    expect(compareEventDates("-0044-03-15", "-0100-01-01")).toBeGreaterThan(0);
    expect(compareEventDates("1969-07-20", "1969-07-16")).toBeGreaterThan(0);
    expect(compareEventDates("1969-07-20", "1969-07-20")).toBe(0);
  });

  it("formats dates for display", () => {
    expect(formatEventDate("1969-07-20")).toBe("20 July 1969");
    expect(formatEventDate("-0044-03-15")).toBe("15 March 44 BC");
    expect(formatEventDate("0800-12-25")).toBe("25 December 800");
  });

  it("rejects malformed dates", () => {
    expect(() => parseEventDate("1969-7-20")).toThrow();
    expect(() => parseEventDate("1969-13-01")).toThrow();
    expect(() => parseEventDate("0000-01-01")).toThrow();
  });
  it("rejects days that don't exist in the month", () => {
    expect(() => parseEventDate("1999-02-30")).toThrow();
    expect(() => parseEventDate("1999-04-31")).toThrow();
    expect(() => parseEventDate("1900-02-29")).toThrow();
    expect(() => parseEventDate("-0002-02-29")).toThrow();
  });

  it("accepts leap days, using astronomical years for BC (1 BC is a leap year)", () => {
    expect(parseEventDate("2000-02-29")).toEqual({ year: 2000, month: 2, day: 29 });
    expect(parseEventDate("2024-02-29").day).toBe(29);
    expect(parseEventDate("-0001-02-29")).toEqual({ year: -1, month: 2, day: 29 });
  });
});
