# Backend API and admin dashboard: design

Date: 2026-10-03
Status: approved in conversation, awaiting written-spec review

## Goal

Move Chronodle's event bank out of the game bundle and into a Postgres
database, behind a small API. Add an admin dashboard to manage the events.

- The game fetches its event list from the API and still builds puzzles in the
  browser, as it does today.
- The admin dashboard can list, search, filter, create, edit, enable/disable and
  delete events.
- This runs locally only. There is no authentication and no deployment in this
  phase. Because there is no auth, the admin dashboard and admin API must not
  be exposed publicly.

### Success criteria

1. `npm run db:up && npm run db:migrate && npm run db:seed && npm run dev` gives
   a working game at :5173 and admin at :5174, backed by the API at :3000.
2. An event created or edited in the admin appears in the next game page load.
   A disabled event does not appear.
3. The admin form and the API reject the same invalid input, because both use
   one shared schema.
4. If the API is unreachable, the game shows an error with Retry instead of
   breaking.
5. `npm test` passes without Docker. `npm run test:db` passes against the local
   Postgres.

### Out of scope

Authentication, deployment and Dockerfiles for the apps, server-side
pagination and search, daily puzzles, and showing genre in the game.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Where it runs | Local dev only | No auth yet; hosting is a later phase |
| Backend language | TypeScript on Node 22 | Shares types and validation with both frontends |
| Repo layout | npm workspaces monorepo | Each app has one job, and validation is shared |
| API framework | Hono (`@hono/node-server`) with `@hono/zod-validator` | Small, typed, and uses zod schemas directly |
| Data access | Drizzle ORM with drizzle-kit SQL migrations | Schema in TypeScript, migrations as plain SQL |
| Database | Postgres 17 via `docker compose` | |
| Validation | zod schema in `packages/shared` | One rule set for the admin form, the API and the seed data |
| If the API fails | Game shows an error with Retry, and has no bundled fallback | The database is the single source of truth |
| Event IDs | Kebab-case slugs, fixed after creation | Readable, and keeps existing IDs stable |

## Repository layout

```
package.json            npm workspaces root and orchestration scripts
docker-compose.yml      postgres:17, port 5432, named volume, db "chronodle"
.env.example            DATABASE_URL=postgres://chronodle:chronodle@localhost:5432/chronodle
apps/game/              the current Vite app (src/, index.html, vite.config.ts, public/)
apps/admin/             new Vite + React admin app
apps/api/               new Hono API, Drizzle schema, migrations and seed
packages/shared/        types, date helpers and the event schema, used by all three
```

`packages/shared` is published inside the workspace as `@chronodle/shared`.
It is consumed as TypeScript source (its `exports` point at `src/index.ts`),
so it has no build step: Vite and `tsx` compile it directly.

### Root scripts

| Script | What it does |
| --- | --- |
| `dev` | Runs the game (:5173), admin (:5174) and API (:3000) together via `concurrently` |
| `test` | Runs `vitest run` in every workspace. Needs no database. |
| `test:db` | Runs the API repository tests against `chronodle_test` |
| `build` | Type-checks and builds every workspace |
| `db:up` / `db:down` | `docker compose up -d` / `down` |
| `db:migrate` | Applies the drizzle-kit migrations |
| `db:seed` | Inserts the seed events. Idempotent. |

## Shared package (`packages/shared/src`)

- **`types.ts`:** `GENRES`, `Genre` and `HistoricalEvent`, unchanged from the
  game's current types:
  `{ id, name, description, date, wikipedia, genre? }`.
  It adds `AdminEvent = HistoricalEvent & { enabled: boolean; createdAt: string; updatedAt: string }`,
  where the timestamps are ISO strings.
- **`dates.ts` and `dates.test.ts`:** moved unchanged from `src/game/`.
- **`schema.ts`:**
  - `eventInputSchema` is a zod object for creating an event:
    - `id`: matches `^[a-z0-9]+(-[a-z0-9]+)*$`, at most 60 characters
    - `name`: trimmed, 1–26 characters
    - `description`: trimmed, 1–200 characters, and must not match `\b\d{3,4}\b` (no years)
    - `date`: accepted by `parseEventDate` from `dates.ts`
    - `wikipedia`: matches `^https://en\.wikipedia\.org/wiki/\S+$`
    - `genre`: one of `GENRES`, or absent/`null`
    - `enabled`: boolean, default `true`
  - `eventPatchSchema` is the same schema without `id`, with every field
    optional, and it must contain at least one field.
- **`schema.test.ts`:** covers each rule, accepting and rejecting, and checks
  that every seed event passes `eventInputSchema`. This replaces the
  "event bank" test in `generate.test.ts`.

The game-only modules (`generate`, `evaluate`, `state`) stay in
`apps/game/src/game/`, and they import types from `@chronodle/shared`.

## Database

The `events` table is defined in `apps/api/src/db/schema.ts`. Migrations are
generated into `apps/api/drizzle/`.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `text` | primary key |
| `name` | `text` | not null |
| `description` | `text` | not null |
| `date` | `text` | not null, unique |
| `wikipedia` | `text` | not null |
| `genre` | `text` | null, `CHECK (genre IN (...GENRES))` |
| `enabled` | `boolean` | not null, default `true` |
| `created_at` | `timestamptz` | not null, default `now()` |
| `updated_at` | `timestamptz` | not null, default `now()`, set by the repository on every update |

`date` is stored as text in the shared `YYYY-MM-DD` / `-YYYY-MM-DD` format.
Postgres's `date` type writes BC years with a `BC` suffix (`0044-03-15 BC`)
instead of our leading minus sign, so text avoids converting in both
directions. Text does not sort BC dates correctly, so ordering by date is done
in code with `compareEventDates`.

`date` is unique across all events, enabled or not. Two events on the same
date would have no single correct order.

### Seed

`apps/api/src/db/seed-events.ts` holds the 39 events, moved from
`src/data/events.ts`. `apps/api/src/db/seed.ts` inserts them with
`ON CONFLICT (id) DO NOTHING`, so re-running it never overwrites changes made
in the admin. It reports how many rows it inserted and how many it skipped.

## API (`apps/api/src`)

- **`app.ts`:** `createApp(repo: EventRepository)` builds the Hono app. It has
  no database dependency of its own, so tests can pass in a fake.
- **`repository.ts`:** defines the `EventRepository` interface and
  `createPgEventRepository(db)`:
  - `listEnabled(): Promise<HistoricalEvent[]>`
  - `listAll(): Promise<AdminEvent[]>`
  - `create(input): Promise<AdminEvent>`
  - `update(id, patch): Promise<AdminEvent | null>`
  - `remove(id): Promise<boolean>`

  Unique violations (Postgres error `23505`) become a `ConflictError` that
  names the field (`id` or `date`) and the id of the existing event.
- **`index.ts`:** reads `DATABASE_URL` (default as in `.env.example`) and
  `PORT` (default 3000), then starts the server.

### Endpoints

| Method and path | Success | Notes |
| --- | --- | --- |
| `GET /api/events` | 200 `HistoricalEvent[]` | Enabled events only. Omits `enabled` and the timestamps, and omits `genre` when it is null. |
| `GET /api/admin/events` | 200 `AdminEvent[]` | All events, sorted by `compareEventDates` |
| `POST /api/admin/events` | 201 `AdminEvent` | Body is checked with `eventInputSchema` |
| `PATCH /api/admin/events/:id` | 200 `AdminEvent` | Body is checked with `eventPatchSchema`. `id` cannot be changed. |
| `DELETE /api/admin/events/:id` | 204 | |
| `GET /api/health` | 200 `{ ok: true }` | Checks the database with `SELECT 1` |

### Errors

Every error body has the shape
`{ error: { code: string; message: string; fields?: Record<string, string> } }`.

| Status | Code | When |
| --- | --- | --- |
| 400 | `validation_failed` | zod failure. `fields` maps each field path to its first message. |
| 404 | `not_found` | Unknown `:id` on PATCH or DELETE, or an unknown route |
| 409 | `conflict` | Duplicate id or date. `fields` names the field, e.g. `{ date: "Already used by \"battle-of-hastings\"" }`. |
| 500 | `internal` | Anything else. Logged on the server; the response never includes SQL or a stack trace. |

## Admin dashboard (`apps/admin`)

A single-page Vite + React app with no router.

- **`src/api.ts`:** a typed `fetch` client for the admin endpoints. Non-2xx
  responses throw `ApiError { status, code, message, fields }`.
- **`src/useEvents.ts`:** loads the list and exposes `create`, `update`,
  `remove` and `toggle`. After each successful call it updates the local list
  from the server's response.
- **Pure logic in `src/logic/`:** `slugify`, `filterEvents` (search, genre,
  status), `sortEvents` and `fieldErrors` (merges zod and API errors).
  Each has unit tests.

### Screens

**Header**
- Shows counts: "N events · M enabled".
- If fewer than 5 events are enabled, shows a warning: "The game needs at
  least 5 enabled events."

**Toolbar**
- Text search across name, description and id
- Genre filter: All, each genre, or Untagged
- Status filter: All, Enabled or Disabled
- A "New event" button

**Table**
- Columns: date (formatted with `formatEventDate`), name, genre, an enabled
  toggle, and edit/delete actions.
- Sorted by date by default. Clicking the name or genre header sorts by that
  column, and clicking again reverses the order.
- The enabled toggle sends a PATCH right away. If it fails, the toggle reverts
  and an inline error appears on that row.

**Event form** (a native `<dialog>`, used for both create and edit)

| Field | Behaviour |
| --- | --- |
| Name | Live counter out of 26 |
| ID | Filled from `slugify(name)` until the user edits it. Read-only when editing. |
| Date | Text input with the hint `YYYY-MM-DD; BC as -0044-03-15`, plus a live preview such as "→ 15 March 44 BC" |
| Description | Textarea |
| Wikipedia URL | Includes an "open ↗" link |
| Genre | Select with "None" plus `GENRES` |
| Enabled | Checkbox |

- Validates with the shared schema as the user types (after the first blur)
  and again on submit.
- API `fields` errors (400 or 409) appear on the matching inputs. Any other
  error appears at the top of the form.

**Delete confirm dialog**
- Names the event and offers "Disable instead", "Delete" and "Cancel".

**When the API is unreachable**
- The list load fails and a banner appears with a Retry button.

Styling reuses the game's fonts and colour tokens in a denser, tool-like
layout.

## Game changes (`apps/game`)

- **`src/api.ts`:** `fetchEvents(): Promise<HistoricalEvent[]>` calls
  `GET /api/events`.
- **`src/hooks/useEventBank.ts`:** returns
  `{ status: "loading" | "error" | "ready", events, error, retry }`.
  It fetches once per page load.
- **`App.tsx`:** renders the masthead in every state.
  - Loading: shows "Loading events…".
  - Error: shows an error card with Retry.
  - Ready with fewer than 5 events: shows "Not enough events available yet".
  - Otherwise: renders `<Game bank={events} />`.

  The Board, WinDialog, `useGame` and the "New game" button move into
  `Game.tsx`.
- **`useGame(bank)`:** `bank` becomes required, and the import of `EVENTS` is
  removed.
- **`src/data/events.ts`:** deleted; its contents become the API's seed data.
- **`generate.test.ts`:** uses a fixture of 8 events in
  `src/game/test-fixtures.ts`. Its "event bank" test moves to the shared
  schema tests.

## Dev proxy

Both `vite.config.ts` files proxy `/api` to `http://localhost:3000`, so the
browser calls stay same-origin and no CORS setup is needed.

## Testing

| Layer | How | Runs in |
| --- | --- | --- |
| Shared schema and dates | vitest unit tests | `npm test` |
| API routes | vitest with `app.request()` and an in-memory fake `EventRepository`. Covers status codes, the error shape, validation, hiding disabled events and ignoring `id` on PATCH. | `npm test` |
| Repository | vitest against the `chronodle_test` database, migrated before the tests and truncated between them. Covers the unique date, the genre CHECK, `updated_at` changing, and the seed being idempotent. | `npm run test:db` |
| Admin logic | vitest unit tests for `slugify`, filtering, sorting and `fieldErrors` | `npm test` |
| Game | existing tests, switched to the fixture | `npm test` |
| End to end | Manual: run the full stack, change an event in the admin, check that the game reflects it | by hand |

## README

Update the setup steps (Docker, migrate, seed, dev), the layout table, and add
a warning that the admin has no authentication and must not be exposed.
