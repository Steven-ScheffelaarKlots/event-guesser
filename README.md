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
npm run db:up        # Postgres 17 in Docker on localhost:5434
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

The API reads `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT` and `HOST` (default
`127.0.0.1`, localhost only) from the
environment or from a root `.env`. See `.env.example` for the defaults.

## Deploying with Docker (Unraid)

Every push to `main` runs the tests and publishes
`ghcr.io/steven-scheffelaarklots/chronodle:latest` (see
`.github/workflows/docker.yml`). The image runs one process with two ports:

| Container port | Serves | Expose |
| --- | --- | --- |
| `3000` | The game and `GET /api/events` | Fine behind a reverse proxy |
| `3001` | The admin dashboard and `/api/admin` | **LAN only.** It has no login. |

On startup it applies migrations, and seeds the starter events only if the
table is empty. Events you delete later stay deleted.

To run it on Unraid with the Compose Manager plugin:

1. Make the GHCR package public (GitHub → Packages → chronodle → Package
   settings), or run `docker login ghcr.io` on the server with a token that has
   `read:packages`.
2. Create a new stack. Paste `deploy/docker-compose.yml` into it, and put the
   values from `deploy/.env.example` into the stack's env file with a real
   `POSTGRES_PASSWORD`.
3. Compose Up. The game is at `http://<unraid-ip>:8080` and the admin at
   `http://<unraid-ip>:8081`. Postgres data lives in
   `/mnt/user/appdata/chronodle/postgres`.

To update, pull and restart the stack (Compose Manager: "Update Stack"). When
you put the game behind a reverse proxy, proxy only port 8080.

To try the image locally, run `docker build -t chronodle .`.

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
