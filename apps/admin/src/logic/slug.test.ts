import { ID_MAX } from "@chronodle/shared";
import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Battle of Hastings", "battle-of-hastings"],
    ["Luther's 95 Theses", "luthers-95-theses"],
    ["Blücher’s Café", "bluchers-cafe"],
    ["  --Hello,   World!! ", "hello-world"],
    ["", ""],
  ])("%j → %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("caps the length at the id limit without a trailing hyphen", () => {
    const slug = slugify("word ".repeat(30));
    expect(slug.length).toBeLessThanOrEqual(ID_MAX);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
