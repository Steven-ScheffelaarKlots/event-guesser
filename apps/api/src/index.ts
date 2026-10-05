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
