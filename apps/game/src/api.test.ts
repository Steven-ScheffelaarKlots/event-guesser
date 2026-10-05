import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEvents } from "./api";

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchEvents", () => {
  it("returns the events from /api/events", async () => {
    const events = [{ id: "a", name: "A", description: "", date: "2000-01-01", wikipedia: "" }];
    stubFetch(async () => Response.json(events));
    await expect(fetchEvents()).resolves.toEqual(events);
    expect(fetch).toHaveBeenCalledWith("/api/events");
  });

  it("explains an error status, even when the body is HTML from the dev proxy", async () => {
    stubFetch(async () => new Response("<html>Bad Gateway</html>", { status: 502 }));
    await expect(fetchEvents()).rejects.toThrow("The server returned an error (HTTP 502).");
  });

  it("explains a network failure", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetchEvents()).rejects.toThrow("Couldn't reach the server.");
  });

  it("rejects a successful response that isn't a list", async () => {
    stubFetch(async () => new Response("<html></html>", { status: 200 }));
    await expect(fetchEvents()).rejects.toThrow("The server sent an unexpected response.");
  });
});
