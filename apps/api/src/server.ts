// Production entry (Docker): migrates, seeds a fresh database, then serves the game and the
// admin on separate ports. `npm run dev` uses index.ts instead, with Vite serving the frontends.
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { ADMIN_DIR, ADMIN_PORT, DATABASE_URL, GAME_DIR, HOST, PORT } from "./config";
import { createDb } from "./db/client";
import { runMigrations } from "./db/migrations";
import { seedIfEmpty } from "./db/seed";
import { createPgEventRepository } from "./repository";

const { db, pool } = createDb(DATABASE_URL);
await runMigrations(db);
const seeded = await seedIfEmpty(db);
if (seeded > 0) console.log(`Empty database: seeded ${seeded} starter events.`);

const repo = createPgEventRepository(db);
const checkHealth = async () => {
  await pool.query("SELECT 1");
};

const servers = [
  serve(
    { fetch: createApp(repo, { checkHealth, routes: "public", staticRoot: GAME_DIR }).fetch, port: PORT, hostname: HOST },
    (info) => console.log(`Game on port ${info.port}`),
  ),
  serve(
    { fetch: createApp(repo, { checkHealth, routes: "admin", staticRoot: ADMIN_DIR }).fetch, port: ADMIN_PORT, hostname: HOST },
    (info) => console.log(`Admin on port ${info.port} (no login: keep it off the public internet)`),
  ),
];

// `docker stop` sends SIGTERM; without a handler Node (PID 1) ignores it and gets killed after 10s.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    for (const server of servers) server.close();
    void pool.end().finally(() => process.exit(0));
  });
}
