import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, deleteEvent, listEvents, updateEvent } from "./api";

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin api client", () => {
  it("returns parsed JSON on success", async () => {
    stubFetch(async () => Response.json([]));
    await expect(listEvents()).resolves.toEqual([]);
  });

  it("sends JSON with the method and an encoded path", async () => {
    stubFetch(async () => Response.json({}));
    await updateEvent("a b", { enabled: false });
    expect(fetch).toHaveBeenCalledWith("/api/admin/events/a%20b", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: '{"enabled":false}',
    });
  });

  it("resolves to undefined for 204", async () => {
    stubFetch(async () => new Response(null, { status: 204 }));
    await expect(deleteEvent("x")).resolves.toBeUndefined();
  });

  it("turns an API error body into an ApiError with fields", async () => {
    stubFetch(async () =>
      Response.json(
        { error: { code: "conflict", message: "Taken", fields: { date: 'Already used by "x"' } } },
        { status: 409 },
      ),
    );
    const error = await listEvents().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "conflict",
      message: "Taken",
      fields: { date: 'Already used by "x"' },
    });
  });

  it("explains a non-JSON 5xx, such as the dev proxy's response when the API is down", async () => {
    stubFetch(async () => new Response("<html>Bad Gateway</html>", { status: 502 }));
    await expect(listEvents()).rejects.toMatchObject({
      status: 502,
      code: "unknown",
      message: "The API isn't responding (HTTP 502). Is it running?",
      fields: {},
    });
  });

  it("explains a network failure", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(listEvents()).rejects.toMatchObject({ status: 0, code: "network" });
  });
});
