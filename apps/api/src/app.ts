import { eventInputSchema, eventPatchSchema, issuesToFields } from "@chronodle/shared";
import { Hono, type Context } from "hono";
import type { z } from "zod";
import { ConflictError, type EventRepository } from "./repository";

type ErrorCode = "validation_failed" | "not_found" | "conflict" | "internal";

function errorBody(code: ErrorCode, message: string, fields?: Record<string, string>) {
  return { error: fields ? { code, message, fields } : { code, message } };
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Validates a JSON body, turning every failure (including bad JSON) into our 400 shape. */
async function parseBody<T>(c: Context, schema: z.ZodType<T>): Promise<Parsed<T>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, response: c.json(errorBody("validation_failed", "Request body must be valid JSON"), 400) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false,
      response: c.json(errorBody("validation_failed", "Some fields are invalid", issuesToFields(result.error)), 400),
    };
  }
  return { ok: true, data: result.data };
}

export interface AppOptions {
  /** Throws if a dependency (the database) is unavailable. */
  checkHealth?: () => Promise<void>;
}

export function createApp(repo: EventRepository, { checkHealth = async () => {} }: AppOptions = {}) {
  const app = new Hono();
  const notFound = (c: Context, id: string) => c.json(errorBody("not_found", `No event with id "${id}"`), 404);

  app.get("/api/health", async (c) => {
    await checkHealth();
    return c.json({ ok: true });
  });

  app.get("/api/events", async (c) => c.json(await repo.listEnabled()));

  app.get("/api/admin/events", async (c) => c.json(await repo.listAll()));

  app.post("/api/admin/events", async (c) => {
    const parsed = await parseBody(c, eventInputSchema);
    if (!parsed.ok) return parsed.response;
    return c.json(await repo.create(parsed.data), 201);
  });

  app.patch("/api/admin/events/:id", async (c) => {
    const parsed = await parseBody(c, eventPatchSchema);
    if (!parsed.ok) return parsed.response;
    const id = c.req.param("id");
    const updated = await repo.update(id, parsed.data);
    return updated ? c.json(updated) : notFound(c, id);
  });

  app.delete("/api/admin/events/:id", async (c) => {
    const id = c.req.param("id");
    return (await repo.remove(id)) ? c.body(null, 204) : notFound(c, id);
  });

  app.notFound((c) => c.json(errorBody("not_found", "Not found"), 404));

  app.onError((error, c) => {
    if (error instanceof ConflictError) {
      return c.json(
        errorBody("conflict", error.message, { [error.field]: `Already used by "${error.existingId}"` }),
        409,
      );
    }
    console.error(error);
    return c.json(errorBody("internal", "Something went wrong"), 500);
  });

  return app;
}
