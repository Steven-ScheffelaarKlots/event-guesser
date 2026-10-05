import type { AdminEvent } from "@chronodle/shared";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { createFakeEventRepository } from "./test/fake-repository";

const hastings: AdminEvent = {
  id: "battle-of-hastings",
  name: "Battle of Hastings",
  description: "William of Normandy defeats King Harold II.",
  date: "1066-10-14",
  wikipedia: "https://en.wikipedia.org/wiki/Battle_of_Hastings",
  genre: "war",
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const caesar: AdminEvent = {
  ...hastings,
  id: "caesar-assassinated",
  name: "Caesar assassinated",
  description: "Julius Caesar is stabbed by senators.",
  date: "-0044-03-15",
  wikipedia: "https://en.wikipedia.org/wiki/Assassination_of_Julius_Caesar",
  genre: "politics",
  enabled: false,
};
const newEvent = {
  id: "moon-landing",
  name: "Moon landing",
  description: "Apollo 11's crew walks on the Moon.",
  date: "1969-07-20",
  wikipedia: "https://en.wikipedia.org/wiki/Apollo_11",
  genre: "exploration",
};

function setup() {
  const repo = createFakeEventRepository([hastings, caesar]);
  return { repo, app: createApp(repo) };
}

function send(method: string, body: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

describe("GET /api/events", () => {
  it("returns enabled events only, without admin fields", async () => {
    const res = await setup().app.request("/api/events");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: hastings.id,
        name: hastings.name,
        description: hastings.description,
        date: hastings.date,
        wikipedia: hastings.wikipedia,
        genre: "war",
      },
    ]);
  });
});

describe("GET /api/admin/events", () => {
  it("returns every event, earliest first, with admin fields", async () => {
    const res = await setup().app.request("/api/admin/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminEvent[];
    expect(body.map((e) => e.id)).toEqual(["caesar-assassinated", "battle-of-hastings"]);
    expect(body[0].enabled).toBe(false);
  });
});

describe("POST /api/admin/events", () => {
  it("creates an event and returns 201 with it", async () => {
    const { app } = setup();
    const res = await app.request("/api/admin/events", send("POST", newEvent));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ...newEvent, enabled: true });

    const list = (await (await app.request("/api/events")).json()) as { id: string }[];
    expect(list.map((e) => e.id)).toContain("moon-landing");
  });

  it("returns 400 with per-field messages for invalid input", async () => {
    const res = await setup().app.request(
      "/api/admin/events",
      send("POST", { ...newEvent, name: "x".repeat(27), wikipedia: "https://example.com" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "validation_failed",
        message: "Some fields are invalid",
        fields: { name: expect.any(String), wikipedia: expect.any(String) },
      },
    });
  });

  it.each(["{not json", ""])("returns 400 for a malformed body (%j)", async (raw) => {
    const res = await setup().app.request("/api/admin/events", send("POST", raw));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: { code: "validation_failed", message: "Request body must be valid JSON" },
    });
  });

  it("rejects a body that isn't sent as JSON, so cross-site form posts can't create events", async () => {
    const res = await setup().app.request("/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(newEvent),
    });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({
      error: { code: "validation_failed", message: "Send the request body as JSON (Content-Type: application/json)" },
    });
  });

  it("returns 409 naming the event that already has the date", async () => {
    const res = await setup().app.request("/api/admin/events", send("POST", { ...newEvent, date: hastings.date }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        code: "conflict",
        message: expect.any(String),
        fields: { date: 'Already used by "battle-of-hastings"' },
      },
    });
  });

  it("returns 409 for a duplicate id", async () => {
    const res = await setup().app.request("/api/admin/events", send("POST", { ...newEvent, id: hastings.id }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { fields: object } }).error.fields).toEqual({
      id: 'Already used by "battle-of-hastings"',
    });
  });
});

describe("PATCH /api/admin/events/:id", () => {
  it("updates the given fields and ignores id in the body", async () => {
    const { app } = setup();
    const res = await app.request(
      "/api/admin/events/battle-of-hastings",
      send("PATCH", { id: "renamed", name: "Hastings", enabled: false }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: "battle-of-hastings",
      name: "Hastings",
      enabled: false,
      date: hastings.date,
    });
  });

  it("clears the genre when sent null", async () => {
    const { app } = setup();
    await app.request("/api/admin/events/battle-of-hastings", send("PATCH", { genre: null }));
    const [event] = (await (await app.request("/api/events")).json()) as object[];
    expect(event).not.toHaveProperty("genre");
  });

  it("returns 400 for an empty patch", async () => {
    const res = await setup().app.request("/api/admin/events/battle-of-hastings", send("PATCH", {}));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("validation_failed");
  });

  it("returns 409 when moving onto another event's date", async () => {
    const res = await setup().app.request(
      "/api/admin/events/battle-of-hastings",
      send("PATCH", { date: caesar.date }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await setup().app.request("/api/admin/events/nope", send("PATCH", { name: "x" }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_found");
  });
});

describe("DELETE /api/admin/events/:id", () => {
  it("deletes with 204, then 404s", async () => {
    const { app } = setup();
    const first = await app.request("/api/admin/events/battle-of-hastings", { method: "DELETE" });
    expect(first.status).toBe(204);
    expect(await first.text()).toBe("");
    const second = await app.request("/api/admin/events/battle-of-hastings", { method: "DELETE" });
    expect(second.status).toBe(404);
  });
});

describe("errors and health", () => {
  it("returns JSON 404 for unknown routes", async () => {
    const res = await setup().app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createFakeEventRepository();
    repo.listAll = async () => {
      throw new Error('relation "events" does not exist');
    };
    const res = await createApp(repo).request("/api/admin/events");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Something went wrong" } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("reports health, and 500s when the check fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createFakeEventRepository();
    expect(await (await createApp(repo).request("/api/health")).json()).toEqual({ ok: true });

    const failing = createApp(repo, {
      checkHealth: async () => {
        throw new Error("connection refused");
      },
    });
    expect((await failing.request("/api/health")).status).toBe(500);
    spy.mockRestore();
  });
});
