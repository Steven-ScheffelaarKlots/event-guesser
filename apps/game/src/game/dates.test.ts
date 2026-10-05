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
});
