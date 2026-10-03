# Backend API and Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Chronodle's event bank into Postgres behind a Hono API, point the game at the API, and add a React admin dashboard for managing events.

**Architecture:** The repo becomes an npm workspaces monorepo with four packages:
- `apps/game` is the existing Vite app.
- `apps/admin` is a new Vite + React app.
- `apps/api` is a Hono API using Drizzle and Postgres.
- `packages/shared` holds the types, date helpers and the zod event schema. It is consumed as TypeScript source.

The API's routes depend on an `EventRepository` interface, so route tests run against an in-memory fake and only the repository tests need a real database.

**Tech Stack:** Node 22, TypeScript 7, React 19, Vite 8, Vitest 5, Hono 4 with `@hono/node-server` 2, Drizzle ORM 0.45 with drizzle-kit 0.31, `pg` 8, zod 4, Postgres 17 (Docker), and `concurrently` 10.

**Spec:** `docs/superpowers/specs/2026-10-03-backend-admin-design.md`

## Global Constraints

- Workspace package names are `@chronodle/game`, `@chronodle/admin`, `@chronodle/api` and `@chronodle/shared`. Other workspaces depend on shared with `"@chronodle/shared": "*"`.
- Ports:
  - API: `3000`
  - Game: `5173`
  - Admin: `5174` (`strictPort`)
  - Postgres: host port **`5433`**. Port 5432 is already used by a local Postgres on the dev machine; see the spec deviations below.
- `DATABASE_URL` defaults to `postgres://chronodle:chronodle@localhost:5433/chronodle`.
- `TEST_DATABASE_URL` defaults to `postgres://chronodle:chronodle@localhost:5433/chronodle_test`.
- Event rules, which live in one place, `packages/shared/src/schema.ts`:
  - `id`: matches `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 60 characters
  - `name`: trimmed, 1–26 characters
  - `description`: trimmed, 1–200 characters, and must not match `\b\d{3,4}\b`
  - `date`: parseable by `parseEventDate`, and must be a real calendar date
  - `wikipedia`: matches `^https://en\.wikipedia\.org/wiki/\S+$`
  - `genre`: one of `GENRES`, or `null`/absent
  - `enabled`: boolean, defaulting to `true`
- Every API error body is `{ error: { code, message, fields? } }`. The codes are `validation_failed` (400), `not_found` (404), `conflict` (409) and `internal` (500).
- Code style follows the existing code: 2-space indent, double quotes, semicolons, trailing commas, and named exports except `App`. Comments are sparse and explain *why*.
- Add no dependencies beyond those named in this plan.
- `npm test` must pass without Docker. Database tests run only via `npm run test:db`.

## Spec deviations (decided while planning)

1. **Postgres host port 5433 instead of 5432**, because 5432 is taken on the dev machine.
2. **Request bodies are validated with `schema.safeParse` in a small `parseBody` helper rather than `@hono/zod-validator`.** This keeps every failure in our error shape, including malformed JSON, which zod-validator would let Hono turn into a plain-text 400.
3. **The check that every seed event passes the schema lives in `apps/api/src/db/seed-events.test.ts`, not in the shared package.** The seed data belongs to the API, and shared must not depend on the API.
4. **`useEventBank()` returns `{ bank, retry }`, where `bank` is a discriminated union**: `{ status: "loading" } | { status: "error"; error } | { status: "ready"; events }`. This replaces separate `status`/`events`/`error` fields, so each state carries only the data that's valid in it.
5. **A shared `PUZZLE_SIZE = 5` constant** means the game's puzzle size and the admin's "needs at least 5 enabled" warning can't drift apart.

## Review Focus

1. **Malformed or empty JSON body on POST/PATCH** (a typo'd curl, an empty body). Expected: 400 `validation_failed` with "Request body must be valid JSON", never a 500. The tests are in Task 4.
2. **An impossible calendar date typed in the admin**, such as `1999-02-30`, `1900-02-29` or `1999-04-31`. Expected: rejected as an invalid date. Today `parseEventDate` accepts any day up to 31. The tests are in Task 2 (dates and schema).
3. **Clearing an event's genre** (choosing "None" when editing sends `genre: null`). Expected: the database stores NULL and both APIs omit `genre`, rather than returning `genre: null` or ignoring the change. The tests are in Task 3 (repository) and Task 4 (routes).
4. **The API being down while the dev servers run.** Vite's proxy then returns an HTML or empty 5xx response, not JSON. Expected: the game shows its error card with Retry, and the admin shows a readable "API isn't responding" banner, with no crash on `JSON.parse`. The tests are in Task 5 (game `fetchEvents`) and Task 6 (admin `request`).
5. **A half-typed or invalid date in the admin form** (`1969-0`, an empty string). Expected: the live preview shows the format hint instead of throwing, because `formatEventDate` throws on bad input and would blank the whole dialog. The tests are in Task 6 (`datePreview`).

---

### Task 1: Convert the repo to npm workspaces and move the game to `apps/game`

There is no behaviour change. The existing 18 tests and the build must still pass from the new location.

**Files:**
- Move: `src/`, `index.html`, `public/`, `vite.config.ts`, `tsconfig.json` → `apps/game/`
- Create: `apps/game/package.json`
- Modify: `package.json` (becomes the workspace root)
- Delete and regenerate: `package-lock.json`

**Interfaces:**
- Consumes: nothing
- Produces: the workspace root with the scripts `build` and `test` (both run across all workspaces), plus `dev` (game only for now; Task 8 adds the API and admin)

- [ ] **Step 1: Move the game files**

```bash
mkdir -p apps/game
git mv src index.html public vite.config.ts tsconfig.json apps/game/
git rm -q package-lock.json
```

- [ ] **Step 2: Write `apps/game/package.json`**

```json
{
  "name": "@chronodle/game",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/modifiers": "^9.0.0",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  }
}
```

- [ ] **Step 3: Replace the root `package.json`**

The tools shared by several workspaces live at the root. `npm run` puts every ancestor's `node_modules/.bin` on `PATH`, so workspace scripts can call `vite`, `vitest` and `tsc` directly.

```json
{
  "name": "chronodle",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev -w @chronodle/game",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present"
  },
  "devDependencies": {
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@vitejs/plugin-react": "^6.1.1",
    "typescript": "^7.0.2",
    "vite": "^8.3.2",
    "vitest": "^5.0.3"
  }
}
```

- [ ] **Step 4: Install and verify nothing changed**

Run: `npm install && npm test && npm run build`

Expected:
- `@chronodle/game` reports `Tests  18 passed (18)`.
- The build ends with `✓ built in …`.
- `ls apps/game` shows `index.html  package.json  public  src  tsconfig.json  vite.config.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Convert to npm workspaces and move the game to apps/game"
```

---

### Task 2: Shared package with types, stricter dates and the event schema

**Files:**
- Create:
  - `packages/shared/package.json`
  - `packages/shared/tsconfig.json`
  - `packages/shared/src/types.ts`
  - `packages/shared/src/schema.ts`
  - `packages/shared/src/schema.test.ts`
  - `packages/shared/src/index.ts`
- Move: `apps/game/src/game/dates.ts` and `apps/game/src/game/dates.test.ts` → `packages/shared/src/`
- Modify:
  - `packages/shared/src/dates.ts` (adds a calendar check)
  - `packages/shared/src/dates.test.ts`
  - `apps/game/package.json`
  - `apps/game/src/game/types.ts`
  - `apps/game/src/game/generate.ts`
  - `apps/game/src/game/generate.test.ts`
  - `apps/game/src/components/WinDialog.tsx`
  - `apps/game/src/components/AvailableEvents.tsx`

**Interfaces:**
- Consumes: nothing
- Produces, all from `@chronodle/shared`:
  - `PUZZLE_SIZE: 5`
  - `GENRES` (readonly tuple) and `type Genre`
  - `interface HistoricalEvent { id; name; description; date; wikipedia; genre?: Genre }`
  - `type AdminEvent = HistoricalEvent & { enabled: boolean; createdAt: string; updatedAt: string }`
  - `parseEventDate(date): DateParts`, `compareEventDates(a, b): number` and `formatEventDate(date): string`
  - `ID_MAX = 60`, `NAME_MAX = 26` and `DESCRIPTION_MAX = 200`
  - `eventInputSchema` and `eventPatchSchema` (zod)
  - `type EventInput = z.infer<typeof eventInputSchema>` and `type EventPatch = z.infer<typeof eventPatchSchema>`
  - `issuesToFields(error: z.ZodError): Record<string, string>`. Keys are joined field paths, and errors on the whole object use the key `"form"`.

- [ ] **Step 1: Create the package skeleton and move the date helpers**

```bash
mkdir -p packages/shared/src
git mv apps/game/src/game/dates.ts apps/game/src/game/dates.test.ts packages/shared/src/
```

`packages/shared/package.json` (the `build` script only type-checks):

```json
{
  "name": "@chronodle/shared",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p .",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^4.6.5"
  }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": []
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write `packages/shared/src/types.ts`**

The genre and event definitions move here from the game unchanged.

```ts
/** Events per puzzle. The game needs at least this many enabled events. */
export const PUZZLE_SIZE = 5;

/** Broad categories for events. Listed in `GENRES` so they can be iterated. */
export const GENRES = [
  "politics",
  "war",
  "science",
  "technology",
  "exploration",
  "religion",
  "culture",
  "economy",
  "disaster",
] as const;

export type Genre = (typeof GENRES)[number];

/**
 * A single historical event from the event bank.
 *
 * `date` is an ISO-like "YYYY-MM-DD" string. Years before the common era use a
 * leading minus sign and mean "N BC" directly (no year zero), e.g. "-0044-03-15"
 * is 15 March 44 BC.
 */
export interface HistoricalEvent {
  id: string;
  name: string;
  description: string;
  date: string;
  /** Full URL of the English Wikipedia article about the event. */
  wikipedia: string;
  genre?: Genre;
}

/** An event as the admin API returns it. Timestamps are ISO 8601 strings. */
export type AdminEvent = HistoricalEvent & {
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 3: Write the failing tests**

Append to the `describe("dates", …)` block in `packages/shared/src/dates.test.ts`, before its closing `});`:

```ts
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
```

Create `packages/shared/src/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eventInputSchema, eventPatchSchema, issuesToFields } from "./schema";

const valid = {
  id: "moon-landing",
  name: "Moon landing",
  description: "Apollo 11's crew walks on the Moon.",
  date: "1969-07-20",
  wikipedia: "https://en.wikipedia.org/wiki/Apollo_11",
  genre: "exploration",
};

describe("eventInputSchema", () => {
  it("accepts a valid event and defaults enabled to true", () => {
    expect(eventInputSchema.parse(valid)).toEqual({ ...valid, enabled: true });
  });

  it("trims text fields", () => {
    const parsed = eventInputSchema.parse({ ...valid, name: "  Moon landing  ", date: " 1969-07-20 " });
    expect(parsed.name).toBe("Moon landing");
    expect(parsed.date).toBe("1969-07-20");
  });

  it("allows the genre to be missing or null", () => {
    const withoutGenre: Record<string, unknown> = { ...valid };
    delete withoutGenre.genre;
    expect(eventInputSchema.safeParse(withoutGenre).success).toBe(true);
    expect(eventInputSchema.parse({ ...valid, genre: null }).genre).toBeNull();
  });

  it("accepts a 26-character name and a BC date", () => {
    expect(eventInputSchema.safeParse({ ...valid, name: "x".repeat(26), date: "-0044-03-15" }).success).toBe(true);
  });

  it.each([
    ["id", "Moon Landing"],
    ["id", "moon--landing"],
    ["id", "-moon"],
    ["id", "a".repeat(61)],
    ["name", ""],
    ["name", "   "],
    ["name", "x".repeat(27)],
    ["description", ""],
    ["description", "Apollo 11 lands in 1969."],
    ["description", "x".repeat(201)],
    ["date", "1969-7-20"],
    ["date", "1969-02-30"],
    ["date", "0000-01-01"],
    ["date", "July 1969"],
    ["wikipedia", "http://en.wikipedia.org/wiki/Apollo_11"],
    ["wikipedia", "https://en.m.wikipedia.org/wiki/Apollo_11"],
    ["wikipedia", "https://en.wikipedia.org/wiki/"],
    ["wikipedia", "https://example.com"],
    ["genre", "sports"],
    ["enabled", "yes"],
  ])("rejects %s = %j", (field, value) => {
    const result = eventInputSchema.safeParse({ ...valid, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(issuesToFields(result.error)).toHaveProperty(field);
  });
});

describe("eventPatchSchema", () => {
  it("accepts a partial patch", () => {
    expect(eventPatchSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it("strips id, which cannot be changed", () => {
    expect(eventPatchSchema.parse({ id: "renamed", name: "New name" })).toEqual({ name: "New name" });
  });

  it("allows clearing the genre", () => {
    expect(eventPatchSchema.parse({ genre: null })).toEqual({ genre: null });
  });

  it("rejects an empty patch, including one that only tries to change id", () => {
    for (const body of [{}, { id: "renamed" }]) {
      const result = eventPatchSchema.safeParse(body);
      expect(result.success).toBe(false);
      if (!result.success) expect(issuesToFields(result.error)).toHaveProperty("form");
    }
  });

  it("validates the fields it is given", () => {
    const result = eventPatchSchema.safeParse({ date: "1969-02-30" });
    expect(result.success).toBe(false);
    if (!result.success) expect(issuesToFields(result.error)).toHaveProperty("date");
  });
});

describe("issuesToFields", () => {
  it("keeps the first message per field", () => {
    const result = eventInputSchema.safeParse({ ...valid, name: "", description: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = issuesToFields(result.error);
      expect(Object.keys(fields).sort()).toEqual(["description", "name"]);
      expect(fields.name).toBe("Name is required");
    }
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm install && npm test -w @chronodle/shared`

Expected: FAIL.
- `schema.test.ts` fails to import `./schema`.
- `dates.test.ts` fails "rejects days that don't exist in the month" (no throw for `1999-02-30`).

- [ ] **Step 5: Add the calendar check to `packages/shared/src/dates.ts`**

Add this function above `parseEventDate`:

```ts
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month !== 2) return DAYS_IN_MONTH[month - 1];
  // Proleptic Gregorian leap rule on astronomical years, where 1 BC is year 0.
  const y = year < 0 ? year + 1 : year;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return leap ? 29 : 28;
}
```

In `parseEventDate`, replace the range check:

```ts
  if (parts.year === 0 || parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) {
```

with:

```ts
  if (
    parts.year === 0 ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > daysInMonth(parts.year, parts.month)
  ) {
```

- [ ] **Step 6: Write `packages/shared/src/schema.ts`**

```ts
import { z } from "zod";
import { parseEventDate } from "./dates";
import { GENRES } from "./types";

export const ID_MAX = 60;
export const NAME_MAX = 26;
export const DESCRIPTION_MAX = 200;

function isEventDate(value: string): boolean {
  try {
    parseEventDate(value);
    return true;
  } catch {
    return false;
  }
}

// Shared by create and patch. `id` is create-only because ids are fixed after creation.
const fields = {
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(NAME_MAX, `Keep names to ${NAME_MAX} characters or fewer`),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(DESCRIPTION_MAX, `Keep descriptions to ${DESCRIPTION_MAX} characters or fewer`)
    .refine((value) => !/\b\d{3,4}\b/.test(value), "Leave years out of the description; they give the answer away"),
  date: z
    .string()
    .trim()
    .refine(isEventDate, "Use a real date as YYYY-MM-DD, or -YYYY-MM-DD for BC"),
  wikipedia: z
    .string()
    .trim()
    .regex(/^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/, "Use an English Wikipedia article URL (https://en.wikipedia.org/wiki/…)"),
  genre: z.enum(GENRES).nullable().optional(),
  enabled: z.boolean(),
};

export const eventInputSchema = z.object({
  id: z
    .string()
    .trim()
    .max(ID_MAX, `Keep ids to ${ID_MAX} characters or fewer`)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens"),
  ...fields,
  enabled: fields.enabled.default(true),
});

export const eventPatchSchema = z
  .object(fields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Change at least one field");

export type EventInput = z.infer<typeof eventInputSchema>;
export type EventPatch = z.infer<typeof eventPatchSchema>;

/** First message per field, keyed by field path; object-level issues use "form". */
export function issuesToFields(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.message;
  }
  return result;
}
```

`packages/shared/src/index.ts`:

```ts
export * from "./dates";
export * from "./schema";
export * from "./types";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -w @chronodle/shared && npm run build -w @chronodle/shared`

Expected: all tests pass (`dates.test.ts` and `schema.test.ts`), and `tsc` exits 0.

- [ ] **Step 8: Point the game at the shared package**

In `apps/game/package.json`, add `"@chronodle/shared": "*"` as the first entry under `dependencies`.

In `apps/game/src/game/types.ts`, replace everything above the line `/** One round of the game: the events to order and the correct answer. */` with:

```ts
export { GENRES, type Genre, type HistoricalEvent } from "@chronodle/shared";
import type { HistoricalEvent } from "@chronodle/shared";

```

The re-export keeps the existing `../game/types` imports working. The type import is needed because `Puzzle` below refers to `HistoricalEvent`.

In `apps/game/src/game/generate.ts`, replace the first line and the `DEFAULT_PUZZLE_SIZE` line:

```ts
import { compareEventDates, PUZZLE_SIZE } from "@chronodle/shared";
```

```ts
export const DEFAULT_PUZZLE_SIZE = PUZZLE_SIZE;
```

In `apps/game/src/components/WinDialog.tsx` and `apps/game/src/components/AvailableEvents.tsx`, change:

```ts
import { formatEventDate } from "../game/dates";
```

to:

```ts
import { formatEventDate } from "@chronodle/shared";
```

In `apps/game/src/game/generate.test.ts`, change `import { compareEventDates } from "./dates";` to:

```ts
import { compareEventDates } from "@chronodle/shared";
```

- [ ] **Step 9: Verify the whole workspace**

Run: `npm install && npm test && npm run build`

Expected:
- game: 15 passed (the 3 date tests moved to shared)
- shared: all passed
- both builds succeed
- `grep -rn "game/dates\|\"./dates\"" apps/game/src` prints nothing

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Add shared package with event types, stricter dates and zod schema"
```

---

### Task 3: API database layer (Docker, Drizzle schema, migrations, seed, repository)

**Files:**
- Create:
  - Root infrastructure: `docker-compose.yml`, `docker/create-test-db.sql`, `.env.example`
  - API config: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/vitest.db.config.ts`, `apps/api/drizzle.config.ts`
  - API source: `apps/api/src/config.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/db/client.ts`, `apps/api/src/db/migrations.ts`, `apps/api/src/db/seed.ts`, `apps/api/src/db/seed-events.ts`, `apps/api/src/repository.ts`
  - Scripts: `apps/api/src/scripts/migrate.ts`, `apps/api/src/scripts/seed.ts`
  - Tests: `apps/api/src/db/seed-events.test.ts`, `apps/api/src/repository.db.test.ts`
  - Generated: `apps/api/drizzle/0000_init.sql` and `apps/api/drizzle/meta/*`
- Modify: root `package.json` (`db:*` and `test:db` scripts), `.gitignore`

**Interfaces:**
- Consumes: `@chronodle/shared`: `GENRES`, `Genre`, `HistoricalEvent`, `AdminEvent`, `EventInput`, `EventPatch`, `compareEventDates`, `eventInputSchema`, `issuesToFields`
- Produces:
  - `config.ts`: `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`
  - `db/client.ts`: `createDb(url): { db: Db; pool: pg.Pool }` and `type Db`
  - `db/migrations.ts`: `runMigrations(db): Promise<void>`
  - `db/seed.ts`: `seedEvents(db, seed = SEED_EVENTS): Promise<{ inserted: number; skipped: number }>`
  - `db/seed-events.ts`: `SEED_EVENTS: HistoricalEvent[]`
  - `repository.ts`:
    - `interface EventRepository { listEnabled(): Promise<HistoricalEvent[]>; listAll(): Promise<AdminEvent[]>; create(input: EventInput): Promise<AdminEvent>; update(id: string, patch: EventPatch): Promise<AdminEvent | null>; remove(id: string): Promise<boolean> }`
    - `class ConflictError extends Error { field: "id" | "date"; existingId: string }`
    - `toPublicEvent(fields): HistoricalEvent`, which omits a null genre
    - `createPgEventRepository(db): EventRepository`

- [ ] **Step 1: Start Postgres in Docker**

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: chronodle
      POSTGRES_PASSWORD: chronodle
      POSTGRES_DB: chronodle
    ports:
      # 5433 on the host because a local Postgres may already own 5432.
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/create-test-db.sql:/docker-entrypoint-initdb.d/create-test-db.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chronodle -d chronodle"]
      interval: 2s
      timeout: 5s
      retries: 15

volumes:
  pgdata:
```

`docker/create-test-db.sql` runs only when the volume is first created:

```sql
CREATE DATABASE chronodle_test;
```

`.env.example`:

```sh
# Copy to .env to override. These are the defaults the API uses without a .env.
DATABASE_URL=postgres://chronodle:chronodle@localhost:5433/chronodle
TEST_DATABASE_URL=postgres://chronodle:chronodle@localhost:5433/chronodle_test
PORT=3000
```

Append `.env` to `.gitignore` on a new line.

Run: `docker compose up -d --wait && docker compose exec db psql -U chronodle -lqt | cut -d'|' -f1`

Expected: the list includes `chronodle` and `chronodle_test`.

- [ ] **Step 2: Scaffold `apps/api`**

`apps/api/package.json`:

```json
{
  "name": "@chronodle/api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p .",
    "test": "vitest run",
    "test:db": "vitest run --config vitest.db.config.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/scripts/migrate.ts",
    "db:seed": "tsx src/scripts/seed.ts"
  },
  "dependencies": {
    "@chronodle/shared": "*",
    "@hono/node-server": "^2.1.3",
    "drizzle-orm": "^0.45.3",
    "hono": "^4.13.12",
    "pg": "^8.23.1",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/pg": "^8.23.1",
    "drizzle-kit": "^0.31.11",
    "tsx": "^4.23.15"
  }
}
```

`apps/api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "drizzle.config.ts", "vitest.config.ts", "vitest.db.config.ts"]
}
```

`apps/api/vitest.config.ts`:

```ts
import { configDefaults, defineConfig } from "vitest/config";

// Database tests need Postgres; they run separately via `npm run test:db`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.db.test.ts"] },
});
```

`apps/api/vitest.db.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.db.test.ts"], fileParallelism: false },
});
```

`apps/api/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
```

`apps/api/src/config.ts`:

```ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Optional repo-root .env; real environment variables still win.
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://chronodle:chronodle@localhost:5433/chronodle";
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://chronodle:chronodle@localhost:5433/chronodle_test";
export const PORT = Number(process.env.PORT ?? 3000);
```

Add these scripts to the root `package.json`, after `"test"`:

```json
    "test:db": "npm run test:db -w @chronodle/api",
    "db:up": "docker compose up -d --wait",
    "db:down": "docker compose down",
    "db:migrate": "npm run db:migrate -w @chronodle/api",
    "db:seed": "npm run db:seed -w @chronodle/api"
```

Run: `npm install`

Expected: the install succeeds, and `ls node_modules/@chronodle` shows `api  game  shared`.

- [ ] **Step 3: Copy the event bank into the API as seed data, with its test**

The game keeps its copy until Task 5 removes it.

```bash
mkdir -p apps/api/src/db
cp apps/game/src/data/events.ts apps/api/src/db/seed-events.ts
```

In `apps/api/src/db/seed-events.ts`, replace everything above the line `  {` that opens the first event with:

```ts
import type { HistoricalEvent } from "@chronodle/shared";

/**
 * Starter events loaded by `npm run db:seed`. Seeding skips ids that already
 * exist, so edits made in the admin are never overwritten. Add new events in
 * the admin rather than here.
 */
export const SEED_EVENTS: HistoricalEvent[] = [
```

`apps/api/src/db/seed-events.test.ts`:

```ts
import { eventInputSchema, issuesToFields } from "@chronodle/shared";
import { describe, expect, it } from "vitest";
import { SEED_EVENTS } from "./seed-events";

describe("seed events", () => {
  it("has enough events with unique ids and dates", () => {
    expect(SEED_EVENTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(SEED_EVENTS.map((e) => e.id)).size).toBe(SEED_EVENTS.length);
    expect(new Set(SEED_EVENTS.map((e) => e.date)).size).toBe(SEED_EVENTS.length);
  });

  it.each(SEED_EVENTS.map((event) => [event.id, event] as const))("%s passes the shared schema", (_id, event) => {
    const result = eventInputSchema.safeParse(event);
    expect(result.success ? {} : issuesToFields(result.error)).toEqual({});
  });
});
```

Run: `npm test -w @chronodle/api`

Expected: PASS, 40 tests (1 + 39). This is a data move, so it passes at once. Its job is to guard future edits.

- [ ] **Step 4: Write the failing repository tests**

`apps/api/src/repository.db.test.ts`:

```ts
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
```

Run: `npm run test:db`

Expected: FAIL, because `./db/client`, `./db/migrations`, `./db/schema`, `./db/seed` and `./repository` can't be resolved.

- [ ] **Step 5: Write the Drizzle schema and generate the first migration**

`apps/api/src/db/schema.ts`:

```ts
import { GENRES } from "@chronodle/shared";
import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// GENRES is a fixed list of identifiers, so inlining it as SQL literals is safe.
const genreList = sql.raw(GENRES.map((genre) => `'${genre}'`).join(", "));

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    // "YYYY-MM-DD" / "-YYYY-MM-DD" text, not a Postgres date: see the design spec.
    date: text("date").notNull().unique(),
    wikipedia: text("wikipedia").notNull(),
    genre: text("genre"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("events_genre_check", sql`${table.genre} IN (${genreList})`)],
);

export type EventRow = typeof events.$inferSelect;
```

Run: `npm run db:generate -w @chronodle/api -- --name init`

Expected:
- drizzle-kit reports `[✓] Your SQL migration file ➜ drizzle/0000_init.sql`.
- `apps/api/drizzle/0000_init.sql` contains `CREATE TABLE "events"`, `CONSTRAINT "events_date_unique" UNIQUE("date")` and `CONSTRAINT "events_genre_check" CHECK ("events"."genre" IN ('politics', 'war', 'science', 'technology', 'exploration', 'religion', 'culture', 'economy', 'disaster'))`.

If drizzle-kit fails to load `@chronodle/shared`, its loader may not follow the workspace symlink. In that case change the import in `schema.ts` to `import { GENRES } from "../../../../packages/shared/src/types";` and re-run.

- [ ] **Step 6: Write the database client, migrations and seed**

`apps/api/src/db/client.ts`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  return { db: drizzle({ client: pool, schema }), pool };
}

export type Db = ReturnType<typeof createDb>["db"];
```

`apps/api/src/db/migrations.ts`:

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import type { Db } from "./client";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
```

`apps/api/src/db/seed.ts`:

```ts
import type { HistoricalEvent } from "@chronodle/shared";
import type { Db } from "./client";
import { events } from "./schema";
import { SEED_EVENTS } from "./seed-events";

/** Inserts seed events, skipping ids that already exist so admin edits survive. */
export async function seedEvents(
  db: Db,
  seed: readonly HistoricalEvent[] = SEED_EVENTS,
): Promise<{ inserted: number; skipped: number }> {
  const inserted = await db
    .insert(events)
    .values(seed.map((event) => ({ ...event, genre: event.genre ?? null })))
    .onConflictDoNothing({ target: events.id })
    .returning({ id: events.id });
  return { inserted: inserted.length, skipped: seed.length - inserted.length };
}
```

- [ ] **Step 7: Write the repository**

`apps/api/src/repository.ts`:

```ts
import {
  compareEventDates,
  type AdminEvent,
  type EventInput,
  type EventPatch,
  type Genre,
  type HistoricalEvent,
} from "@chronodle/shared";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { events, type EventRow } from "./db/schema";

export interface EventRepository {
  /** Enabled events in the public shape (no admin fields). */
  listEnabled(): Promise<HistoricalEvent[]>;
  /** Every event, earliest first. */
  listAll(): Promise<AdminEvent[]>;
  create(input: EventInput): Promise<AdminEvent>;
  /** Null when no event has this id. */
  update(id: string, patch: EventPatch): Promise<AdminEvent | null>;
  /** False when no event has this id. */
  remove(id: string): Promise<boolean>;
}

/** An id or date that another event already uses. */
export class ConflictError extends Error {
  readonly field: "id" | "date";
  readonly existingId: string;

  constructor(field: "id" | "date", existingId: string) {
    super(
      field === "id"
        ? `An event with id "${existingId}" already exists`
        : `Another event ("${existingId}") already has this date`,
    );
    this.name = "ConflictError";
    this.field = field;
    this.existingId = existingId;
  }
}

interface EventFields {
  id: string;
  name: string;
  description: string;
  date: string;
  wikipedia: string;
  genre?: string | null;
}

/** The public event shape; a missing or null genre is omitted. */
export function toPublicEvent({ id, name, description, date, wikipedia, genre }: EventFields): HistoricalEvent {
  const event: HistoricalEvent = { id, name, description, date, wikipedia };
  if (genre) event.genre = genre as Genre;
  return event;
}

function toAdminEvent(row: EventRow): AdminEvent {
  return {
    ...toPublicEvent(row),
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Text dates don't sort BC correctly in SQL, so order in code.
const byDate = (a: { date: string }, b: { date: string }) => compareEventDates(a.date, b.date);

/** The violated unique constraint's name, or null if `error` isn't a unique violation. */
function uniqueViolation(error: unknown): string | null {
  // Drizzle wraps driver errors; the pg error (code 23505) is somewhere in the cause chain.
  let current: unknown = error;
  while (current && typeof current === "object") {
    const { code, constraint, cause } = current as { code?: string; constraint?: string; cause?: unknown };
    if (code === "23505") return constraint ?? "";
    current = cause;
  }
  return null;
}

export function createPgEventRepository(db: Db): EventRepository {
  async function rethrowConflict(error: unknown, attempted: { id?: string; date?: string }): Promise<never> {
    const constraint = uniqueViolation(error);
    if (constraint === "events_pkey" && attempted.id) throw new ConflictError("id", attempted.id);
    if (constraint === "events_date_unique" && attempted.date) {
      const [existing] = await db.select({ id: events.id }).from(events).where(eq(events.date, attempted.date));
      throw new ConflictError("date", existing?.id ?? "unknown");
    }
    throw error;
  }

  return {
    async listEnabled() {
      const rows = await db.select().from(events).where(eq(events.enabled, true));
      return rows.sort(byDate).map(toPublicEvent);
    },

    async listAll() {
      const rows = await db.select().from(events);
      return rows.sort(byDate).map(toAdminEvent);
    },

    async create(input) {
      try {
        const [row] = await db
          .insert(events)
          .values({ ...input, genre: input.genre ?? null })
          .returning();
        return toAdminEvent(row);
      } catch (error) {
        return rethrowConflict(error, input);
      }
    },

    async update(id, patch) {
      try {
        const [row] = await db
          .update(events)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(events.id, id))
          .returning();
        return row ? toAdminEvent(row) : null;
      } catch (error) {
        return rethrowConflict(error, patch);
      }
    },

    async remove(id) {
      const rows = await db.delete(events).where(eq(events.id, id)).returning({ id: events.id });
      return rows.length > 0;
    },
  };
}
```

- [ ] **Step 8: Run the repository tests to verify they pass**

Run: `npm run test:db`

Expected: `Tests  10 passed (10)`.

- [ ] **Step 9: Add the migrate and seed command-line scripts, and run them on the dev database**

`apps/api/src/scripts/migrate.ts`:

```ts
import { DATABASE_URL } from "../config";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrations";

const { db, pool } = createDb(DATABASE_URL);
try {
  await runMigrations(db);
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
```

`apps/api/src/scripts/seed.ts`:

```ts
import { DATABASE_URL } from "../config";
import { createDb } from "../db/client";
import { seedEvents } from "../db/seed";

const { db, pool } = createDb(DATABASE_URL);
try {
  const { inserted, skipped } = await seedEvents(db);
  console.log(`Seeded ${inserted} events (${skipped} already present).`);
} finally {
  await pool.end();
}
```

Run: `npm run db:migrate && npm run db:seed && npm run db:seed && docker compose exec db psql -U chronodle -tc "SELECT count(*) FROM events"`

Expected output, in order:
1. `Migrations applied.`
2. `Seeded 39 events (0 already present).`
3. `Seeded 0 events (39 already present).`
4. `39`

- [ ] **Step 10: Check everything still passes, then commit**

Run: `npm test && npm run build`

Expected: all workspaces pass (the API runs only `seed-events.test.ts`), and every `tsc` exits 0.

```bash
git add -A
git commit -m "Add API database layer: Postgres via Docker, Drizzle schema, seed and repository"
```

---

### Task 4: API HTTP layer (routes, errors, server entry)

**Files:**
- Create: `apps/api/src/app.ts`, `apps/api/src/app.test.ts`, `apps/api/src/test/fake-repository.ts`, `apps/api/src/index.ts`

**Interfaces:**
- Consumes:
  - from Task 3: `EventRepository`, `ConflictError`, `toPublicEvent`, `createPgEventRepository`, `createDb`, `DATABASE_URL`, `PORT`
  - from shared: `eventInputSchema`, `eventPatchSchema`, `issuesToFields`
- Produces:
  - `createApp(repo: EventRepository, options?: { checkHealth?: () => Promise<void> }): Hono`
  - the endpoints in the spec: `GET /api/health`, `GET /api/events`, `GET|POST /api/admin/events`, `PATCH|DELETE /api/admin/events/:id`
  - `createFakeEventRepository(initial?: AdminEvent[]): EventRepository` (tests only)

- [ ] **Step 1: Write the in-memory fake repository**

`apps/api/src/test/fake-repository.ts`:

```ts
import { compareEventDates, type AdminEvent } from "@chronodle/shared";
import { ConflictError, toPublicEvent, type EventRepository } from "../repository";

/** In-memory EventRepository with the same uniqueness rules as Postgres. */
export function createFakeEventRepository(initial: AdminEvent[] = []): EventRepository {
  const rows = new Map(initial.map((event) => [event.id, { ...event }]));
  const sorted = () => [...rows.values()].sort((a, b) => compareEventDates(a.date, b.date));

  function assertDateFree(date: string, exceptId?: string) {
    for (const row of rows.values()) {
      if (row.date === date && row.id !== exceptId) throw new ConflictError("date", row.id);
    }
  }

  return {
    async listEnabled() {
      return sorted().filter((row) => row.enabled).map(toPublicEvent);
    },

    async listAll() {
      return sorted().map((row) => ({ ...row }));
    },

    async create(input) {
      if (rows.has(input.id)) throw new ConflictError("id", input.id);
      assertDateFree(input.date);
      const now = new Date().toISOString();
      const event: AdminEvent = { ...toPublicEvent(input), enabled: input.enabled, createdAt: now, updatedAt: now };
      rows.set(event.id, event);
      return { ...event };
    },

    async update(id, patch) {
      const existing = rows.get(id);
      if (!existing) return null;
      if (patch.date !== undefined) assertDateFree(patch.date, id);
      const merged = { ...existing, ...patch };
      const event: AdminEvent = {
        ...toPublicEvent(merged),
        enabled: merged.enabled,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      rows.set(id, event);
      return { ...event };
    },

    async remove(id) {
      return rows.delete(id);
    },
  };
}
```

- [ ] **Step 2: Write the failing route tests**

`apps/api/src/app.test.ts`:

```ts
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
```

Run: `npm test -w @chronodle/api`

Expected: FAIL, because `./app` can't be resolved.

- [ ] **Step 3: Write `apps/api/src/app.ts`**

```ts
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
```

- [ ] **Step 4: Run the route tests to verify they pass**

Run: `npm test -w @chronodle/api`

Expected: PASS, with all of `app.test.ts` (17 tests) plus `seed-events.test.ts`.

- [ ] **Step 5: Write the server entry point**

`apps/api/src/index.ts`:

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { DATABASE_URL, PORT } from "./config";
import { createDb } from "./db/client";
import { createPgEventRepository } from "./repository";

const { db, pool } = createDb(DATABASE_URL);
const app = createApp(createPgEventRepository(db), {
  checkHealth: async () => {
    await pool.query("SELECT 1");
  },
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 6: Smoke-test against the real database**

Run `npm run dev -w @chronodle/api` in the background, then:

```bash
curl -s localhost:3000/api/health
curl -s localhost:3000/api/events | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).length))"
curl -s -X PATCH localhost:3000/api/admin/events/titanic-sinks -H 'Content-Type: application/json' -d '{"enabled":false}' | grep -o '"enabled":false'
curl -s localhost:3000/api/events | grep -c titanic-sinks
curl -s -X PATCH localhost:3000/api/admin/events/titanic-sinks -H 'Content-Type: application/json' -d '{"enabled":true}' > /dev/null
curl -s -X POST localhost:3000/api/admin/events -H 'Content-Type: application/json' -d '{bad'
```

Expected output, in order:
1. `{"ok":true}`
2. `39`
3. `"enabled":false`
4. `0`
5. (nothing, since the restore is silent)
6. `{"error":{"code":"validation_failed","message":"Request body must be valid JSON"}}`

Stop the dev server.

- [ ] **Step 7: Build and commit**

Run: `npm run build -w @chronodle/api`

Expected: `tsc` exits 0.

```bash
git add -A
git commit -m "Add API routes for public and admin event endpoints"
```

---

### Task 5: Game loads events from the API

**Files:**
- Create:
  - `apps/game/src/api.ts`
  - `apps/game/src/api.test.ts`
  - `apps/game/src/hooks/useEventBank.ts`
  - `apps/game/src/components/Masthead.tsx`
  - `apps/game/src/Game.tsx`
  - `apps/game/src/game/test-fixtures.ts`
- Modify:
  - `apps/game/src/App.tsx`
  - `apps/game/src/hooks/useGame.ts`
  - `apps/game/src/game/generate.test.ts`
  - `apps/game/vite.config.ts`
  - `apps/game/src/styles.css`
- Delete: `apps/game/src/data/events.ts` (and the now-empty `data/` folder)

**Interfaces:**
- Consumes: `GET /api/events` (Task 4); `HistoricalEvent` and `PUZZLE_SIZE` from shared
- Produces:
  - `fetchEvents(): Promise<HistoricalEvent[]>`
  - `useEventBank(): { bank: EventBank; retry(): void }`, where `EventBank = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; events: HistoricalEvent[] }`
  - `useGame(bank)`, where `bank` is now required
  - `FIXTURE_EVENTS: HistoricalEvent[]` (8 events, tests only)

- [ ] **Step 1: Write the failing `fetchEvents` tests**

`apps/game/src/api.test.ts`:

```ts
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
```

Run: `npm test -w @chronodle/game`

Expected: FAIL, because `./api` can't be resolved.

- [ ] **Step 2: Write `apps/game/src/api.ts`**

```ts
import type { HistoricalEvent } from "@chronodle/shared";

export async function fetchEvents(): Promise<HistoricalEvent[]> {
  let response: Response;
  try {
    response = await fetch("/api/events");
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  if (!response.ok) throw new Error(`The server returned an error (HTTP ${response.status}).`);
  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) throw new Error("The server sent an unexpected response.");
  return body as HistoricalEvent[];
}
```

Run: `npm test -w @chronodle/game`

Expected: `api.test.ts` passes (4 tests), and the existing tests still pass.

- [ ] **Step 3: Switch the generate tests to a fixture and remove the bundled events**

`apps/game/src/game/test-fixtures.ts`:

```ts
import type { HistoricalEvent } from "./types";

/** A small, stable event bank for game-logic tests. */
export const FIXTURE_EVENTS: HistoricalEvent[] = [
  ["caesar", "-0044-03-15"],
  ["hastings", "1066-10-14"],
  ["magna-carta", "1215-06-15"],
  ["columbus", "1492-10-12"],
  ["bastille", "1789-07-14"],
  ["titanic", "1912-04-15"],
  ["moon-landing", "1969-07-20"],
  ["berlin-wall", "1989-11-09"],
].map(([id, date]) => ({
  id,
  name: id,
  description: `Fixture event ${id}`,
  date,
  wikipedia: `https://en.wikipedia.org/wiki/${id}`,
}));
```

In `apps/game/src/game/generate.test.ts`:
1. Rename the identifier everywhere, including the import, with `sed -i 's/\bEVENTS\b/FIXTURE_EVENTS/g' apps/game/src/game/generate.test.ts`. The word boundaries stop it from touching `FIXTURE_EVENTS`.
2. Change `from "../data/events"` on that import line to `from "./test-fixtures"`.
3. Delete the line `import { GENRES } from "./types";`.
4. Delete the whole `describe("event bank", …)` block at the end of the file. Its checks now live in `apps/api/src/db/seed-events.test.ts`.

Then:

```bash
git rm -q apps/game/src/data/events.ts
```

- [ ] **Step 4: Write the event-bank hook and make `useGame` require a bank**

`apps/game/src/hooks/useEventBank.ts`:

```ts
import type { HistoricalEvent } from "@chronodle/shared";
import { useCallback, useEffect, useState } from "react";
import { fetchEvents } from "../api";

export type EventBank =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; events: HistoricalEvent[] };

/** Fetches the event bank once per page load; `retry` fetches again. */
export function useEventBank() {
  const [bank, setBank] = useState<EventBank>({ status: "loading" });

  const load = useCallback(() => {
    setBank({ status: "loading" });
    fetchEvents().then(
      (events) => setBank({ status: "ready", events }),
      (error: unknown) =>
        setBank({ status: "error", error: error instanceof Error ? error.message : String(error) }),
    );
  }, []);

  useEffect(load, [load]);

  return { bank, retry: load };
}
```

In `apps/game/src/hooks/useGame.ts`:
1. Delete `import { EVENTS } from "../data/events";`.
2. Change `export function useGame(bank: readonly HistoricalEvent[] = EVENTS) {` to:

```ts
export function useGame(bank: readonly HistoricalEvent[]) {
```

- [ ] **Step 5: Split `App` into the loading shell and `Game`**

`apps/game/src/components/Masthead.tsx`:

```tsx
import type { ReactNode } from "react";

export function Masthead({ action }: { action?: ReactNode }) {
  return (
    <header className="masthead">
      <div>
        <h1 className="masthead__title">Chronodle</h1>
        <p className="masthead__tagline">Put five moments from history in order, earliest first.</p>
      </div>
      {action}
    </header>
  );
}
```

`apps/game/src/Game.tsx`:

```tsx
import type { HistoricalEvent } from "@chronodle/shared";
import { Board } from "./components/Board";
import { Masthead } from "./components/Masthead";
import { WinDialog } from "./components/WinDialog";
import { useGame } from "./hooks/useGame";

export function Game({ bank }: { bank: readonly HistoricalEvent[] }) {
  const { state, dispatch, newGame } = useGame(bank);

  return (
    <div className="app">
      <Masthead
        action={
          <button type="button" className="button button--ghost" onClick={newGame}>
            New game
          </button>
        }
      />

      <main>
        <Board state={state} dispatch={dispatch} onNewGame={newGame} />
      </main>

      <WinDialog state={state} onNewGame={newGame} />
    </div>
  );
}
```

Replace `apps/game/src/App.tsx`:

```tsx
import { PUZZLE_SIZE } from "@chronodle/shared";
import { Masthead } from "./components/Masthead";
import { Game } from "./Game";
import { useEventBank } from "./hooks/useEventBank";

export default function App() {
  const { bank, retry } = useEventBank();

  if (bank.status === "ready" && bank.events.length >= PUZZLE_SIZE) {
    return <Game bank={bank.events} />;
  }

  return (
    <div className="app">
      <Masthead />
      <main className="status" role={bank.status === "error" ? "alert" : "status"}>
        {bank.status === "loading" && <p>Loading events…</p>}
        {bank.status === "error" && (
          <>
            <p className="status__title">Couldn't load events</p>
            <p>{bank.error}</p>
            <button type="button" className="button button--primary" onClick={retry}>
              Retry
            </button>
          </>
        )}
        {bank.status === "ready" && <p>Not enough events available yet. Check back soon.</p>}
      </main>
    </div>
  );
}
```

Append this to `apps/game/src/styles.css`, after the `/* ---------- Buttons ---------- */` block (before `/* ---------- Available events ---------- */`):

```css
/* ---------- Loading / error status ---------- */

.status {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 64px 16px;
  text-align: center;
  color: var(--text-muted);
}

.status__title {
  color: var(--text);
  font-size: 1.25rem;
  font-weight: 700;
}
```

Replace `apps/game/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin API calls in dev; the API runs on :3000 (npm run dev at the root).
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

- [ ] **Step 6: Run the tests and build**

Run: `npm test -w @chronodle/game && npm run build -w @chronodle/game`

Expected: 18 tests pass (14 existing, since the event-bank test moved out, plus 4 new), and `grep -rn "data/events" apps/game/src` prints nothing.

- [ ] **Step 7: Check it by hand in the browser**

With Postgres up, run `npm run dev -w @chronodle/api` and `npm run dev -w @chronodle/game`, then open http://localhost:5173.
- Expected: the board renders five events, and solving it shows Wikipedia links.
- Stop the API and reload. Expected: "Couldn't load events" with "The server returned an error (HTTP 500)." (or 502) and a Retry button.
- Start the API again and click Retry. Expected: the board loads.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Load the game's events from the API with loading and error states"
```

---

### Task 6: Admin app scaffold, logic, API client and data hook

**Files:**
- Create:
  - `apps/admin/package.json`
  - `apps/admin/tsconfig.json`
  - `apps/admin/vite.config.ts`
  - `apps/admin/index.html`
  - `apps/admin/src/main.tsx`
  - `apps/admin/src/App.tsx` (placeholder, replaced in Task 7)
  - `apps/admin/src/api.ts`
  - `apps/admin/src/api.test.ts`
  - `apps/admin/src/useEvents.ts`
  - `apps/admin/src/logic/slug.ts`
  - `apps/admin/src/logic/slug.test.ts`
  - `apps/admin/src/logic/events.ts`
  - `apps/admin/src/logic/events.test.ts`
  - `apps/admin/src/logic/form.ts`
  - `apps/admin/src/logic/form.test.ts`

**Interfaces:**
- Consumes: the admin endpoints (Task 4); shared `AdminEvent`, `EventInput`, `EventPatch`, `Genre`, `GENRES`, `ID_MAX`, `compareEventDates`, `formatEventDate`, `eventInputSchema`, `issuesToFields`
- Produces:
  - `api.ts`:
    - `class ApiError extends Error { status: number; code: string; fields: Record<string, string> }`
    - `listEvents(): Promise<AdminEvent[]>`
    - `createEvent(input: EventInput): Promise<AdminEvent>`
    - `updateEvent(id, patch: EventPatch): Promise<AdminEvent>`
    - `deleteEvent(id): Promise<void>`
  - `useEvents.ts`: `useEvents(): { events, status: "loading" | "error" | "ready", error: string | null, reload, create, update, remove }`
  - `logic/slug.ts`: `slugify(text): string`
  - `logic/events.ts`:
    - types `Filters`, `GenreFilter`, `StatusFilter`, `Sort` and `SortKey`
    - `DEFAULT_FILTERS` and `DEFAULT_SORT`
    - `filterEvents(events, filters)`, `sortEvents(events, sort)` and `nextSort(sort, key)`
  - `logic/form.ts`:
    - `FormValues` and `EMPTY_FORM`
    - `formFromEvent(event)`
    - `validateForm(values): FormResult`
    - `datePreview(date): string | null`

- [ ] **Step 1: Scaffold the app**

`apps/admin/package.json`:

```json
{
  "name": "@chronodle/admin",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@chronodle/shared": "*",
    "react": "^19.3.0",
    "react-dom": "^19.3.0"
  }
}
```

Copy the game's tsconfig, which needs no changes:

```bash
mkdir -p apps/admin/src/logic apps/admin/src/components
cp apps/game/tsconfig.json apps/admin/tsconfig.json
```

`apps/admin/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { "/api": "http://localhost:3000" },
  },
});
```

`apps/admin/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1c2541" />
    <title>Chronodle admin</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;1,7..72,400&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/admin/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`apps/admin/src/App.tsx` (placeholder; Task 7 replaces it):

```tsx
export default function App() {
  return <h1>Chronodle admin</h1>;
}
```

Run: `npm install`

Expected: `ls node_modules/@chronodle` shows `admin  api  game  shared`.

- [ ] **Step 2: Write the failing logic and client tests**

`apps/admin/src/logic/slug.test.ts`:

```ts
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
```

`apps/admin/src/logic/events.test.ts`:

```ts
import type { AdminEvent } from "@chronodle/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filterEvents, nextSort, sortEvents } from "./events";

function make(id: string, date: string, extra: Partial<AdminEvent> = {}): AdminEvent {
  return {
    id,
    name: id,
    description: `About ${id}`,
    date,
    wikipedia: `https://en.wikipedia.org/wiki/${id}`,
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const events = [
  make("moon", "1969-07-20", { name: "Moon landing", genre: "exploration" }),
  make("caesar", "-0044-03-15", { name: "Caesar assassinated", genre: "politics", enabled: false }),
  make("hastings", "1066-10-14", { name: "Battle of Hastings", genre: "war", description: "Norman conquest begins" }),
  make("web", "1991-08-06", { name: "First website online" }),
];

const ids = (list: AdminEvent[]) => list.map((e) => e.id);

describe("filterEvents", () => {
  it("keeps everything with the default filters", () => {
    expect(ids(filterEvents(events, DEFAULT_FILTERS))).toEqual(["moon", "caesar", "hastings", "web"]);
  });

  it("searches name, description and id, ignoring case and surrounding spaces", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, search: "BATTLE" }))).toEqual(["hastings"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, search: " norman " }))).toEqual(["hastings"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, search: "caes" }))).toEqual(["caesar"]);
  });

  it("filters by genre, including untagged", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, genre: "war" }))).toEqual(["hastings"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, genre: "untagged" }))).toEqual(["web"]);
  });

  it("filters by status", () => {
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, status: "disabled" }))).toEqual(["caesar"]);
    expect(ids(filterEvents(events, { ...DEFAULT_FILTERS, status: "enabled" }))).toEqual(["moon", "hastings", "web"]);
  });

  it("combines filters", () => {
    expect(ids(filterEvents(events, { search: "o", genre: "politics", status: "enabled" }))).toEqual([]);
  });
});

describe("sortEvents", () => {
  it("sorts by date with BC first, and reverses for desc", () => {
    expect(ids(sortEvents(events, { key: "date", direction: "asc" }))).toEqual(["caesar", "hastings", "moon", "web"]);
    expect(ids(sortEvents(events, { key: "date", direction: "desc" }))).toEqual(["web", "moon", "hastings", "caesar"]);
  });

  it("sorts by name", () => {
    expect(ids(sortEvents(events, { key: "name", direction: "asc" }))).toEqual(["hastings", "caesar", "web", "moon"]);
  });

  it("sorts by genre with untagged events last", () => {
    expect(ids(sortEvents(events, { key: "genre", direction: "asc" }))).toEqual(["moon", "caesar", "hastings", "web"]);
  });

  it("does not mutate its input", () => {
    const copy = [...events];
    sortEvents(events, { key: "name", direction: "asc" });
    expect(events).toEqual(copy);
  });
});

describe("nextSort", () => {
  it("flips direction on the same column and starts ascending on a new one", () => {
    expect(nextSort({ key: "date", direction: "asc" }, "date")).toEqual({ key: "date", direction: "desc" });
    expect(nextSort({ key: "date", direction: "desc" }, "name")).toEqual({ key: "name", direction: "asc" });
  });
});
```

`apps/admin/src/logic/form.test.ts`:

```ts
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
    const event: AdminEvent = { ...values, enabled: false, createdAt: "", updatedAt: "" };
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
```

`apps/admin/src/api.test.ts`:

```ts
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
```

Run: `npm test -w @chronodle/admin`

Expected: FAIL, because `./slug`, `./events`, `./form` and `./api` can't be resolved.

- [ ] **Step 3: Implement the logic modules**

`apps/admin/src/logic/slug.ts`:

```ts
import { ID_MAX } from "@chronodle/shared";

/** Kebab-case id suggestion from an event name: "Blücher’s Café" → "bluchers-cafe". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ID_MAX)
    .replace(/-+$/, "");
}
```

`apps/admin/src/logic/events.ts`:

```ts
import { compareEventDates, type AdminEvent, type Genre } from "@chronodle/shared";

export type GenreFilter = "all" | "untagged" | Genre;
export type StatusFilter = "all" | "enabled" | "disabled";

export interface Filters {
  search: string;
  genre: GenreFilter;
  status: StatusFilter;
}

export const DEFAULT_FILTERS: Filters = { search: "", genre: "all", status: "all" };

export function filterEvents(events: readonly AdminEvent[], { search, genre, status }: Filters): AdminEvent[] {
  const needle = search.trim().toLowerCase();
  return events.filter(
    (event) =>
      (status === "all" || event.enabled === (status === "enabled")) &&
      (genre === "all" || (genre === "untagged" ? !event.genre : event.genre === genre)) &&
      (!needle || [event.name, event.description, event.id].some((text) => text.toLowerCase().includes(needle))),
  );
}

export type SortKey = "date" | "name" | "genre";

export interface Sort {
  key: SortKey;
  direction: "asc" | "desc";
}

export const DEFAULT_SORT: Sort = { key: "date", direction: "asc" };

type Compare = (a: AdminEvent, b: AdminEvent) => number;

const byDate: Compare = (a, b) => compareEventDates(a.date, b.date);
const byName: Compare = (a, b) => a.name.localeCompare(b.name) || byDate(a, b);
const byGenre: Compare = (a, b) => {
  if (a.genre === b.genre) return byDate(a, b);
  if (!a.genre) return 1; // untagged last
  if (!b.genre) return -1;
  return a.genre.localeCompare(b.genre);
};

const COMPARATORS: Record<SortKey, Compare> = { date: byDate, name: byName, genre: byGenre };

export function sortEvents(events: readonly AdminEvent[], { key, direction }: Sort): AdminEvent[] {
  const sorted = [...events].sort(COMPARATORS[key]);
  return direction === "asc" ? sorted : sorted.reverse();
}

/** Clicking the active column flips its direction; another column starts ascending. */
export function nextSort(current: Sort, key: SortKey): Sort {
  if (current.key === key) return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  return { key, direction: "asc" };
}
```

`apps/admin/src/logic/form.ts`:

```ts
import {
  eventInputSchema,
  formatEventDate,
  issuesToFields,
  type AdminEvent,
  type EventInput,
  type Genre,
} from "@chronodle/shared";

export interface FormValues {
  id: string;
  name: string;
  description: string;
  date: string;
  wikipedia: string;
  /** "" means no genre. */
  genre: Genre | "";
  enabled: boolean;
}

export const EMPTY_FORM: FormValues = {
  id: "",
  name: "",
  description: "",
  date: "",
  wikipedia: "",
  genre: "",
  enabled: true,
};

export function formFromEvent(event: AdminEvent): FormValues {
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    date: event.date,
    wikipedia: event.wikipedia,
    genre: event.genre ?? "",
    enabled: event.enabled,
  };
}

export type FormResult = { ok: true; input: EventInput } | { ok: false; errors: Record<string, string> };

/** Same rules as the API, so most mistakes are caught before saving. */
export function validateForm(values: FormValues): FormResult {
  const parsed = eventInputSchema.safeParse({ ...values, genre: values.genre || null });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, errors: issuesToFields(parsed.error) };
}

/** "20 July 1969" for a valid date, or null while the date is incomplete or invalid. */
export function datePreview(date: string): string | null {
  try {
    return formatEventDate(date.trim());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement the API client**

`apps/admin/src/api.ts`:

```ts
import type { AdminEvent, EventInput, EventPatch } from "@chronodle/shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      path,
      body === undefined
        ? { method }
        : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
  } catch {
    throw new ApiError(0, "network", "Can't reach the API. Is it running?");
  }
  if (response.status === 204) return undefined as T;

  // Error responses from the dev proxy (API down) are HTML or empty, not JSON.
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (json as ErrorBody | null)?.error;
    const fallback =
      response.status >= 500
        ? `The API isn't responding (HTTP ${response.status}). Is it running?`
        : `The API returned an error (HTTP ${response.status}).`;
    throw new ApiError(response.status, error?.code ?? "unknown", error?.message ?? fallback, error?.fields ?? {});
  }
  return json as T;
}

const eventPath = (id: string) => `/api/admin/events/${encodeURIComponent(id)}`;

export const listEvents = () => request<AdminEvent[]>("/api/admin/events");

export const createEvent = (input: EventInput) => request<AdminEvent>("/api/admin/events", "POST", input);

export const updateEvent = (id: string, patch: EventPatch) => request<AdminEvent>(eventPath(id), "PATCH", patch);

export const deleteEvent = (id: string) => request<void>(eventPath(id), "DELETE");
```

The test "returns parsed JSON on success" calls `listEvents()`, which issues `fetch("/api/admin/events", { method: "GET" })`. Only the PATCH test checks the exact `init` object.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w @chronodle/admin`

Expected: PASS for all four files (slug 6, events 10, form 11, api 6).

- [ ] **Step 6: Write the data hook**

`apps/admin/src/useEvents.ts`:

```ts
import type { AdminEvent, EventInput, EventPatch } from "@chronodle/shared";
import { useCallback, useEffect, useState } from "react";
import * as api from "./api";

/**
 * The admin's event list. Mutations go to the API first, and local state is
 * updated only from the server's response, so a failed call leaves the list
 * unchanged (e.g. a failed enable toggle simply stays where it was).
 */
export function useEvents() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      setEvents(await api.listEvents());
      setError(null);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const replace = (updated: AdminEvent) =>
    setEvents((list) => list.map((event) => (event.id === updated.id ? updated : event)));

  const create = useCallback(async (input: EventInput) => {
    const created = await api.createEvent(input);
    setEvents((list) => [...list, created]);
    return created;
  }, []);

  const update = useCallback(async (id: string, patch: EventPatch) => {
    const updated = await api.updateEvent(id, patch);
    replace(updated);
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.deleteEvent(id);
    setEvents((list) => list.filter((event) => event.id !== id));
  }, []);

  return { events, status, error, reload, create, update, remove };
}
```

- [ ] **Step 7: Build and commit**

Run: `npm run build -w @chronodle/admin`

Expected: `tsc` exits 0 and Vite builds.

```bash
git add -A
git commit -m "Add admin app scaffold with event logic, API client and data hook"
```

---

### Task 7: Admin UI (table, toolbar, form dialog, delete dialog)

**Files:**
- Create:
  - `apps/admin/src/components/Toolbar.tsx`
  - `apps/admin/src/components/EventTable.tsx`
  - `apps/admin/src/components/EventFormDialog.tsx`
  - `apps/admin/src/components/DeleteDialog.tsx`
  - `apps/admin/src/styles.css`
- Modify: `apps/admin/src/App.tsx` (replaces the placeholder), `apps/admin/src/main.tsx` (imports the CSS)

**Interfaces:**
- Consumes: everything Task 6 produces; shared `GENRES`, `NAME_MAX`, `PUZZLE_SIZE`, `formatEventDate`
- Produces: the finished admin UI. No exports beyond the components themselves.

- [ ] **Step 1: Write the toolbar**

`apps/admin/src/components/Toolbar.tsx`:

```tsx
import { GENRES } from "@chronodle/shared";
import type { Filters, GenreFilter, StatusFilter } from "../logic/events";

interface ToolbarProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
}

export function Toolbar({ filters, onChange }: ToolbarProps) {
  return (
    <div className="toolbar">
      <input
        type="search"
        className="input toolbar__search"
        placeholder="Search name, description or id"
        aria-label="Search events"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />
      <select
        className="input"
        aria-label="Filter by genre"
        value={filters.genre}
        onChange={(e) => onChange({ ...filters, genre: e.target.value as GenreFilter })}
      >
        <option value="all">All genres</option>
        {GENRES.map((genre) => (
          <option key={genre} value={genre}>
            {genre}
          </option>
        ))}
        <option value="untagged">Untagged</option>
      </select>
      <select
        className="input"
        aria-label="Filter by status"
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as StatusFilter })}
      >
        <option value="all">All statuses</option>
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Write the events table**

`apps/admin/src/components/EventTable.tsx`:

```tsx
import { formatEventDate, type AdminEvent } from "@chronodle/shared";
import { useState } from "react";
import type { Sort, SortKey } from "../logic/events";

interface EventTableProps {
  events: AdminEvent[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  onEdit: (event: AdminEvent) => void;
  onDelete: (event: AdminEvent) => void;
  onToggle: (event: AdminEvent, enabled: boolean) => Promise<unknown>;
}

export function EventTable({ events, sort, onSort, onEdit, onDelete, onToggle }: EventTableProps) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  async function toggle(event: AdminEvent) {
    setPending((ids) => new Set(ids).add(event.id));
    setRowErrors((errors) => {
      const next = { ...errors };
      delete next[event.id];
      return next;
    });
    try {
      await onToggle(event, !event.enabled);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't update this event";
      setRowErrors((errors) => ({ ...errors, [event.id]: message }));
    } finally {
      setPending((ids) => {
        const next = new Set(ids);
        next.delete(event.id);
        return next;
      });
    }
  }

  if (events.length === 0) return <p className="empty">No events match these filters.</p>;

  return (
    <div className="table-wrap">
      <table className="events">
        <thead>
          <tr>
            <SortHeader label="Date" sortKey="date" sort={sort} onSort={onSort} />
            <SortHeader label="Name" sortKey="name" sort={sort} onSort={onSort} />
            <SortHeader label="Genre" sortKey="genre" sort={sort} onSort={onSort} />
            <th scope="col">Enabled</th>
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className={event.enabled ? undefined : "is-disabled"}>
              <td className="events__date">{formatEventDate(event.date)}</td>
              <td>
                <div className="events__name">{event.name}</div>
                <div className="events__desc">{event.description}</div>
              </td>
              <td>{event.genre ?? <span className="muted">—</span>}</td>
              <td>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={event.enabled}
                  disabled={pending.has(event.id)}
                  onChange={() => void toggle(event)}
                  aria-label={`${event.name} enabled`}
                />
                {rowErrors[event.id] && (
                  <div className="row-error" role="alert">
                    {rowErrors[event.id]}
                  </div>
                )}
              </td>
              <td className="events__actions">
                <button type="button" className="button button--small" onClick={() => onEdit(event)}>
                  Edit
                </button>
                <button type="button" className="button button--small button--danger" onClick={() => onDelete(event)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
}

function SortHeader({ label, sortKey, sort, onSort }: SortHeaderProps) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort}>
      <button type="button" className="sort" onClick={() => onSort(sortKey)}>
        {label}
        {active && <span aria-hidden="true">{sort.direction === "asc" ? " ▲" : " ▼"}</span>}
      </button>
    </th>
  );
}
```

- [ ] **Step 3: Write the create/edit dialog**

The dialog shell owns `showModal()`. The form inside is keyed by its target, so its state resets each time the dialog opens.

`apps/admin/src/components/EventFormDialog.tsx`:

```tsx
import { GENRES, NAME_MAX, type AdminEvent, type EventInput, type EventPatch, type Genre } from "@chronodle/shared";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ApiError } from "../api";
import { datePreview, EMPTY_FORM, formFromEvent, validateForm, type FormValues } from "../logic/form";
import { slugify } from "../logic/slug";

type Target = AdminEvent | "new";

interface EventFormDialogProps {
  /** "new" to create, an event to edit, null when closed. */
  target: Target | null;
  onClose: () => void;
  onCreate: (input: EventInput) => Promise<unknown>;
  onUpdate: (id: string, patch: EventPatch) => Promise<unknown>;
}

export function EventFormDialog({ target, onClose, onCreate, onUpdate }: EventFormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (target && !dialog.open) dialog.showModal();
    if (!target && dialog.open) dialog.close();
  }, [target]);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="event-form-title" onClose={onClose}>
      {target && (
        <EventForm
          key={target === "new" ? "new" : target.id}
          target={target}
          onClose={onClose}
          onCreate={onCreate}
          onUpdate={onUpdate}
        />
      )}
    </dialog>
  );
}

interface EventFormProps extends Omit<EventFormDialogProps, "target"> {
  target: Target;
}

function EventForm({ target, onClose, onCreate, onUpdate }: EventFormProps) {
  const isNew = target === "new";
  const [values, setValues] = useState<FormValues>(() => (target === "new" ? EMPTY_FORM : formFromEvent(target)));
  // While creating, the id follows the name until the user edits the id themselves.
  const [idEdited, setIdEdited] = useState(!isNew);
  const [touched, setTouched] = useState<ReadonlySet<keyof FormValues>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const result = validateForm(values);
  const clientErrors = result.ok ? {} : result.errors;
  const errorFor = (field: keyof FormValues) =>
    serverErrors[field] ?? (submitted || touched.has(field) ? clientErrors[field] : undefined);

  function set<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => {
      const next = { ...current, [field]: value };
      if (field === "name" && !idEdited) next.id = slugify(String(value));
      return next;
    });
    setServerErrors((errors) => {
      const next = { ...errors };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  const blur = (field: keyof FormValues) => () => setTouched((fields) => new Set(fields).add(field));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!result.ok) return;
    setSaving(true);
    try {
      if (isNew) {
        await onCreate(result.input);
      } else {
        const { id, ...patch } = result.input;
        await onUpdate(id, patch);
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length > 0) setServerErrors(error.fields);
      else setServerErrors({ form: error instanceof Error ? error.message : "Something went wrong. Try again." });
    } finally {
      setSaving(false);
    }
  }

  const preview = datePreview(values.date);
  const inputProps = (field: keyof FormValues) => ({
    id: `field-${field}`,
    onBlur: blur(field),
    "aria-invalid": errorFor(field) ? true : undefined,
  });

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h2 id="event-form-title" className="dialog__title">
        {target === "new" ? "New event" : `Edit “${target.name}”`}
      </h2>

      {(serverErrors.form ?? (submitted ? clientErrors.form : undefined)) && (
        <div className="banner banner--error" role="alert">
          {serverErrors.form ?? clientErrors.form}
        </div>
      )}

      <Field label="Name" field="name" error={errorFor("name")} hint={`${values.name.trim().length}/${NAME_MAX}`}>
        <input
          {...inputProps("name")}
          className="input"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          autoFocus
        />
      </Field>

      <Field
        label="ID"
        field="id"
        error={errorFor("id")}
        hint={isNew ? "Filled in from the name. It can't be changed after creating." : "IDs can't be changed."}
      >
        <input
          {...inputProps("id")}
          className="input input--mono"
          value={values.id}
          readOnly={!isNew}
          onChange={(e) => {
            setIdEdited(true);
            set("id", e.target.value);
          }}
        />
      </Field>

      <Field
        label="Date"
        field="date"
        error={errorFor("date")}
        hint={preview ? `→ ${preview}` : "YYYY-MM-DD; BC as -0044-03-15"}
      >
        <input
          {...inputProps("date")}
          className="input input--mono"
          value={values.date}
          placeholder="1969-07-20"
          onChange={(e) => set("date", e.target.value)}
        />
      </Field>

      <Field label="Description" field="description" error={errorFor("description")} hint="No years: they give the answer away.">
        <textarea
          {...inputProps("description")}
          className="input"
          rows={3}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field
        label="Wikipedia URL"
        field="wikipedia"
        error={errorFor("wikipedia")}
        hint={
          values.wikipedia ? (
            <a href={values.wikipedia} target="_blank" rel="noreferrer">
              open ↗
            </a>
          ) : (
            "https://en.wikipedia.org/wiki/…"
          )
        }
      >
        <input
          {...inputProps("wikipedia")}
          className="input"
          type="url"
          value={values.wikipedia}
          onChange={(e) => set("wikipedia", e.target.value)}
        />
      </Field>

      <Field label="Genre" field="genre" error={errorFor("genre")}>
        <select
          {...inputProps("genre")}
          className="input"
          value={values.genre}
          onChange={(e) => set("genre", e.target.value as Genre | "")}
        >
          <option value="">None</option>
          {GENRES.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
      </Field>

      <label className="checkbox">
        <input type="checkbox" checked={values.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        Enabled (shown in the game)
      </label>

      <div className="dialog__actions">
        <button type="button" className="button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? "Saving…" : isNew ? "Create event" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  field: keyof FormValues;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}

function Field({ label, field, error, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={`field-${field}`}>
        {label}
      </label>
      {children}
      {error ? <div className="field__error">{error}</div> : hint && <div className="field__hint">{hint}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Write the delete dialog**

`apps/admin/src/components/DeleteDialog.tsx`:

```tsx
import type { AdminEvent } from "@chronodle/shared";
import { useEffect, useRef, useState } from "react";

interface DeleteDialogProps {
  event: AdminEvent | null;
  onClose: () => void;
  onDelete: (id: string) => Promise<unknown>;
  onDisable: (event: AdminEvent) => Promise<unknown>;
}

export function DeleteDialog({ event, onClose, onDelete, onDisable }: DeleteDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (event && !dialog.open) dialog.showModal();
    if (!event && dialog.open) dialog.close();
  }, [event]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      className="dialog dialog--narrow"
      aria-labelledby="delete-title"
      onClose={() => {
        setError(null);
        onClose();
      }}
    >
      {event && (
        <div className="form">
          <h2 id="delete-title" className="dialog__title">
            Delete “{event.name}”?
          </h2>
          <p>This permanently removes the event. Disabling hides it from the game but keeps it here.</p>
          {error && (
            <div className="banner banner--error" role="alert">
              {error}
            </div>
          )}
          <div className="dialog__actions">
            <button type="button" className="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {event.enabled && (
              <button type="button" className="button" onClick={() => run(() => onDisable(event))} disabled={busy}>
                Disable instead
              </button>
            )}
            <button
              type="button"
              className="button button--danger"
              onClick={() => run(() => onDelete(event.id))}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
```

- [ ] **Step 5: Write `App.tsx` and wire in the CSS**

Replace `apps/admin/src/App.tsx`:

```tsx
import { PUZZLE_SIZE, type AdminEvent } from "@chronodle/shared";
import { useMemo, useState } from "react";
import { DeleteDialog } from "./components/DeleteDialog";
import { EventFormDialog } from "./components/EventFormDialog";
import { EventTable } from "./components/EventTable";
import { Toolbar } from "./components/Toolbar";
import { DEFAULT_FILTERS, DEFAULT_SORT, filterEvents, nextSort, sortEvents } from "./logic/events";
import { useEvents } from "./useEvents";

export default function App() {
  const { events, status, error, reload, create, update, remove } = useEvents();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [editing, setEditing] = useState<AdminEvent | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminEvent | null>(null);

  const visible = useMemo(() => sortEvents(filterEvents(events, filters), sort), [events, filters, sort]);
  const enabledCount = events.filter((event) => event.enabled).length;

  return (
    <div className="admin">
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Chronodle admin</h1>
          {status === "ready" && (
            <p className="admin__counts">
              {events.length} events · {enabledCount} enabled
            </p>
          )}
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => setEditing("new")}
          disabled={status !== "ready"}
        >
          New event
        </button>
      </header>

      {status === "ready" && enabledCount < PUZZLE_SIZE && (
        <div className="banner banner--warning" role="status">
          The game needs at least {PUZZLE_SIZE} enabled events.
        </div>
      )}

      {status === "error" && (
        <div className="banner banner--error" role="alert">
          <span>{error}</span>
          <button type="button" className="button button--small" onClick={() => void reload()}>
            Retry
          </button>
        </div>
      )}

      {status === "loading" && <p className="muted">Loading events…</p>}

      {status === "ready" && (
        <>
          <Toolbar filters={filters} onChange={setFilters} />
          <EventTable
            events={visible}
            sort={sort}
            onSort={(key) => setSort((current) => nextSort(current, key))}
            onEdit={setEditing}
            onDelete={setDeleting}
            onToggle={(event, enabled) => update(event.id, { enabled })}
          />
        </>
      )}

      <EventFormDialog target={editing} onClose={() => setEditing(null)} onCreate={create} onUpdate={update} />
      <DeleteDialog
        event={deleting}
        onClose={() => setDeleting(null)}
        onDelete={remove}
        onDisable={(event) => update(event.id, { enabled: false })}
      />
    </div>
  );
}
```

In `apps/admin/src/main.tsx`, add `import "./styles.css";` after the `import App from "./App";` line.

`apps/admin/src/styles.css`:

```css
:root {
  --ink: #1c2541;
  --ink-raised: #243058;
  --ink-sunken: #18203a;
  --ink-line: #36436e;
  --text: #eef1fa;
  --text-muted: #a9b3ce;
  --accent: #9db4ff;
  --near: #f0c75e;
  --danger: #e46c5b;
  --danger-text: #ffb4a8;

  --font-display: "Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Literata", Georgia, "Times New Roman", serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  color-scheme: dark;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--ink);
  color: var(--text);
  font-family: var(--font-display);
  font-size: 15px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}

h1,
h2,
p {
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

a {
  color: var(--accent);
}

:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.muted,
.empty {
  color: var(--text-muted);
}

/* ---------- Layout ---------- */

.admin {
  display: grid;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 24px 64px;
}

.admin__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.admin__title {
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.admin__counts {
  color: var(--text-muted);
}

.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid;
  border-radius: 12px;
}

.banner--warning {
  border-color: var(--near);
  background: color-mix(in srgb, var(--near) 12%, transparent);
}

.banner--error {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 14%, transparent);
}

/* ---------- Buttons and inputs ---------- */

.button {
  border: 1.5px solid var(--ink-line);
  border-radius: 999px;
  padding: 8px 18px;
  background: transparent;
  font-weight: 650;
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s;
}

.button:hover:not(:disabled) {
  border-color: var(--accent);
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--ink);
}

.button--primary:hover:not(:disabled) {
  border-color: #b7c8ff;
  background: #b7c8ff;
}

.button--danger {
  border-color: var(--danger);
  color: var(--danger-text);
}

.button--danger:hover:not(:disabled) {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 20%, transparent);
}

.button--small {
  padding: 4px 12px;
  font-size: 0.88rem;
}

.input {
  width: 100%;
  border: 1.5px solid var(--ink-line);
  border-radius: 10px;
  padding: 8px 12px;
  background: var(--ink-sunken);
}

.input:focus {
  border-color: var(--accent);
  outline: none;
}

.input[aria-invalid="true"] {
  border-color: var(--danger);
}

.input[readonly] {
  opacity: 0.7;
}

.input--mono {
  font-family: var(--font-mono);
}

textarea.input {
  resize: vertical;
  font-family: var(--font-body);
}

.toggle,
.checkbox input {
  width: 18px;
  height: 18px;
  accent-color: var(--accent);
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ---------- Toolbar ---------- */

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.toolbar .input {
  width: auto;
}

.toolbar .toolbar__search {
  flex: 1 1 260px;
}

/* ---------- Table ---------- */

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--ink-line);
  border-radius: 14px;
}

.events {
  width: 100%;
  border-collapse: collapse;
}

.events th,
.events td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--ink-line);
  text-align: left;
  vertical-align: top;
}

.events tbody tr:last-child td {
  border-bottom: 0;
}

.events th {
  background: var(--ink-raised);
  color: var(--text-muted);
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* Dim the content of disabled rows but keep their controls readable. */
.events tr.is-disabled td:nth-child(-n + 3) {
  opacity: 0.5;
}

.events__date {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.events__name {
  font-weight: 650;
}

.events__desc {
  color: var(--text-muted);
  font-family: var(--font-body);
  font-size: 0.9rem;
}

.events__actions {
  white-space: nowrap;
  text-align: right;
}

.events__actions .button + .button {
  margin-left: 6px;
}

.sort {
  all: unset;
  cursor: pointer;
}

.sort:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.row-error {
  margin-top: 4px;
  color: var(--danger-text);
  font-size: 0.85rem;
}

/* ---------- Dialogs and forms ---------- */

.dialog {
  width: min(560px, calc(100vw - 32px));
  border: 1px solid var(--ink-line);
  border-radius: 18px;
  padding: 0;
  background: var(--ink-raised);
  color: var(--text);
}

.dialog--narrow {
  width: min(440px, calc(100vw - 32px));
}

.dialog::backdrop {
  background: rgb(10 14 30 / 0.7);
}

.dialog__title {
  font-size: 1.3rem;
  font-weight: 750;
}

.dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.form {
  display: grid;
  gap: 14px;
  padding: 22px;
}

.field {
  display: grid;
  gap: 4px;
}

.field__label {
  font-size: 0.92rem;
  font-weight: 650;
}

.field__hint {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.field__error {
  color: var(--danger-text);
  font-size: 0.85rem;
}

@media (max-width: 640px) {
  .admin {
    padding: 16px;
  }

  .events__desc {
    display: none;
  }
}
```

- [ ] **Step 6: Build**

Run: `npm test -w @chronodle/admin && npm run build -w @chronodle/admin`

Expected: the tests still pass, `tsc` exits 0, and Vite builds.

- [ ] **Step 7: Check it by hand in the browser**

With Postgres up and the seed loaded, run `npm run dev -w @chronodle/api` and `npm run dev -w @chronodle/admin`, then open http://localhost:5174. Check each of the following:

1. **Header:** shows "39 events · 39 enabled", and the table is sorted by date with "15 March 44 BC" first.
2. **Search:** typing `norman` leaves only the Hastings row. Genre "war" plus status "Enabled" filters correctly. Clicking the "Name" header sorts A→Z, and clicking it again sorts Z→A.
3. **Toggle:** unchecking Titanic dims the row and the header shows 38 enabled. `curl -s localhost:3000/api/events | grep -c titanic` prints `0`. Re-check the toggle afterwards.
4. **New event, invalid date:** in "New event", type the name "Test event" and the ID auto-fills to `test-event`. Typing the date `1969-02-30` and tabbing out shows the date error. Typing `1969-07-21` shows "→ 21 July 1969".
5. **New event, conflict:** fill a description and the URL `https://en.wikipedia.org/wiki/Test`, set the date to `1969-07-20`, and save. The date field shows `Already used by "moon-landing"`. Change it to `1969-07-21` and save. The dialog closes and the row appears.
6. **Edit:** editing the test event shows a read-only ID. Setting the genre to "science" and saving shows "science" in the row. Editing again, setting it back to "None" and saving shows "—".
7. **Delete:** "Delete" on the test event opens the confirm dialog, and "Delete" removes the row.
8. **API down:** stop the API and reload. The banner reads "The API isn't responding (HTTP 500). Is it running?" (or 502) with a Retry button. Start the API and click Retry, and the table loads.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add admin dashboard UI for listing, editing, toggling and deleting events"
```

---

### Task 8: One-command dev workflow, README, and end-to-end check

**Files:**
- Modify: root `package.json` (the `dev` script and the `concurrently` dev dependency), `README.md`

**Interfaces:**
- Consumes: every workspace's `dev` script
- Produces: `npm run dev` starts the API, game and admin together

- [ ] **Step 1: Add `concurrently` and the combined dev script**

Run: `npm install -D concurrently@^10.0.5`

In the root `package.json`, replace the `dev` script:

```json
    "dev": "concurrently -n api,game,admin -c blue,green,magenta \"npm run dev -w @chronodle/api\" \"npm run dev -w @chronodle/game\" \"npm run dev -w @chronodle/admin\"",
```

- [ ] **Step 2: Rewrite `README.md`**

````markdown
# Chronodle

Put five historical events in chronological order. After each guess, every card
is coloured by how far it is from its correct position:

- **Green**: right spot
- **Yellow**: one spot off
- **Red**: two or more spots off

Events live in Postgres and are served by a small API. An admin dashboard
manages them.

## Running locally

Needs Node 22+ and Docker.

```sh
npm install
npm run db:up        # Postgres 17 in Docker on localhost:5433
npm run db:migrate   # create or upgrade tables
npm run db:seed      # load the starter events (safe to re-run; never overwrites edits)
npm run dev          # API :3000, game http://localhost:5173, admin http://localhost:5174
```

> **The admin has no login.** Anyone who can reach the admin app or the API's
> `/api/admin` routes can change events. Keep this on your own machine until
> authentication is added.

| Script | What it does |
| --- | --- |
| `npm test` | Unit and route tests for every workspace. No database needed. |
| `npm run test:db` | Repository tests against the `chronodle_test` database (needs `db:up`) |
| `npm run build` | Type-checks and builds every workspace |
| `npm run db:down` | Stops Postgres. Data is kept in a Docker volume. |

The API reads `DATABASE_URL`, `TEST_DATABASE_URL` and `PORT` from the
environment or from a root `.env`. See `.env.example` for the defaults.

## Layout

| Path | Responsibility |
| --- | --- |
| `packages/shared` | Event types and `GENRES`, date parsing and formatting (BC as `-YYYY`), and the zod `eventInputSchema`/`eventPatchSchema` used by both the API and the admin form. |
| `apps/api` | Hono API. `app.ts` holds the routes; `repository.ts` handles Postgres access through Drizzle; `db/` contains the schema, migrations and seed data. |
| `apps/game` | The game. `src/game/` is pure game logic; `src/hooks/useEventBank.ts` loads events from `GET /api/events`. |
| `apps/admin` | Admin dashboard. `src/logic/` holds pure helpers (slugs, filtering, sorting, form validation); `src/components/` holds the table and dialogs. |

### API

| Method and path | Purpose |
| --- | --- |
| `GET /api/events` | Enabled events, for the game |
| `GET /api/admin/events` | All events with `enabled` and timestamps |
| `POST /api/admin/events` | Create an event |
| `PATCH /api/admin/events/:id` | Update any fields except `id` |
| `DELETE /api/admin/events/:id` | Delete an event |
| `GET /api/health` | Checks the database connection |

Every error comes back as `{ "error": { "code", "message", "fields"? } }`.

### Changing the database schema

Edit `apps/api/src/db/schema.ts`, then run
`npm run db:generate -w @chronodle/api -- --name <change>` and
`npm run db:migrate`. Adding a genre to `GENRES` also changes the database's
CHECK constraint, so it needs a migration too.
````

- [ ] **Step 3: Run the full verification**

Run: `npm test && npm run test:db && npm run build`

Expected: every workspace's tests pass, the database tests report `10 passed`, and every build succeeds.

- [ ] **Step 4: End-to-end check**

Run: `npm run dev`

Expected: the three prefixed processes start, with `[api] API listening on http://localhost:3000`, plus the Vite URLs for `[game]` (5173) and `[admin]` (5174).

1. In the admin, disable 35 events using the status filter and toggles, or use `curl` in a loop. The admin shows the "needs at least 5" warning. Reload the game: with 4 enabled it shows "Not enough events available yet". Re-enable them.
2. In the admin, rename "Moon landing" to "Apollo 11 lands". Click "New game" in the game until the event appears, or reload, and confirm the new name shows.
3. Stop with Ctrl-C. Expected: all three processes exit.

A quick way to bulk-disable and re-enable for step 1:

```bash
ids=$(curl -s localhost:3000/api/admin/events | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).slice(4).map(e=>e.id).join(' ')))")
for id in $ids; do curl -s -X PATCH localhost:3000/api/admin/events/$id -H 'Content-Type: application/json' -d '{"enabled":false}' > /dev/null; done
# … check the game and the admin …
for id in $ids; do curl -s -X PATCH localhost:3000/api/admin/events/$id -H 'Content-Type: application/json' -d '{"enabled":true}' > /dev/null; done
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Run API, game and admin together and document the new setup"
```
