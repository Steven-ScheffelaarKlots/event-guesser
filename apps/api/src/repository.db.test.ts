import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "./config";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrations";
import { events } from "./db/schema";
import { seedEvents } from "./db/seed";
import { SEED_EVENTS } from "./db/seed-events";
import { ConflictError, createPgEventRepository } from "./repository";

const { db, pool } = createDb(TEST_DATABASE_URL);
const repo = createPgEventRepository(db);

const hastings = {
  id: "battle-of-hastings",
  name: "Battle of Hastings",
  description: "William of Normandy defeats King Harold II.",
  date: "1066-10-14",
  wikipedia: "https://en.wikipedia.org/wiki/Battle_of_Hastings",
  genre: "war" as const,
  enabled: true,
};
const moon = {
  id: "moon-landing",
  name: "Moon landing",
  description: "Apollo 11's crew walks on the Moon.",
  date: "1969-07-20",
  wikipedia: "https://en.wikipedia.org/wiki/Apollo_11",
  genre: null,
  enabled: true,
};

beforeAll(async () => {
  await runMigrations(db);
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE events`);
});

afterAll(async () => {
  await pool.end();
});

describe("pg event repository", () => {
  it("creates events and lists them by date, BC first", async () => {
    await repo.create(moon);
    await repo.create(hastings);
    await repo.create({ ...hastings, id: "caesar", name: "Caesar assassinated", date: "-0044-03-15" });

    const all = await repo.listAll();
    expect(all.map((e) => e.id)).toEqual(["caesar", "battle-of-hastings", "moon-landing"]);
    expect(all[1]).toMatchObject({ ...hastings, enabled: true });
    expect(typeof all[1].createdAt).toBe("string");
  });

  it("listEnabled hides disabled events and admin-only fields", async () => {
    await repo.create(hastings);
    await repo.create({ ...moon, enabled: false });

    expect(await repo.listEnabled()).toEqual([
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

  it("omits a null genre", async () => {
    await repo.create(moon);
    const [event] = await repo.listEnabled();
    expect(event).not.toHaveProperty("genre");
  });

  it("rejects a duplicate id", async () => {
    await repo.create(hastings);
    const error = await repo.create({ ...hastings, date: "1066-10-15" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ field: "id", existingId: "battle-of-hastings" });
  });

  it("rejects a duplicate date, naming the existing event even when it is disabled", async () => {
    await repo.create({ ...hastings, enabled: false });
    const error = await repo.create({ ...moon, date: hastings.date }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error).toMatchObject({ field: "date", existingId: "battle-of-hastings" });
  });

  it("rejects moving an event onto another event's date", async () => {
    await repo.create(hastings);
    await repo.create(moon);
    const error = await repo.update(moon.id, { date: hastings.date }).catch((e: unknown) => e);
    expect(error).toMatchObject({ field: "date", existingId: "battle-of-hastings" });
  });

  it("updates only the given fields, can clear the genre, and bumps updatedAt", async () => {
    const created = await repo.create(hastings);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await repo.update(hastings.id, { name: "Hastings", genre: null });
    expect(updated).toMatchObject({ name: "Hastings", description: hastings.description, date: hastings.date });
    expect(updated).not.toHaveProperty("genre");
    expect(updated!.updatedAt > created.updatedAt).toBe(true);
    expect(updated!.createdAt).toBe(created.createdAt);
  });

  it("returns null or false for unknown ids", async () => {
    await repo.create(hastings);
    expect(await repo.update("nope", { name: "x" })).toBeNull();
    expect(await repo.remove("nope")).toBe(false);
    expect(await repo.remove(hastings.id)).toBe(true);
    expect(await repo.listAll()).toEqual([]);
  });

  it("enforces the genre CHECK constraint in the database", async () => {
    await expect(db.insert(events).values({ ...hastings, genre: "sports" })).rejects.toThrow();
  });

  it("seeds idempotently without overwriting edits", async () => {
    expect(await seedEvents(db)).toEqual({ inserted: SEED_EVENTS.length, skipped: 0 });
    await repo.update("battle-of-hastings", { name: "Edited" });

    expect(await seedEvents(db)).toEqual({ inserted: 0, skipped: SEED_EVENTS.length });
    const edited = (await repo.listAll()).find((e) => e.id === "battle-of-hastings");
    expect(edited?.name).toBe("Edited");
  });
});
