import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDb", () => {
  it("survives the pool losing an idle connection (e.g. Postgres restarting)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { pool } = createDb("postgres://chronodle:chronodle@127.0.0.1:1/none");
    expect(() => pool.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
    expect(spy).toHaveBeenCalled();
    await pool.end();
  });
});
