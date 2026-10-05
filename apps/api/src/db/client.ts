import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  // An idle connection dropping (e.g. Postgres restarting) emits "error"; unhandled, it would crash the API.
  pool.on("error", (error) => console.error("Postgres pool error:", error.message));
  return { db: drizzle({ client: pool, schema }), pool };
}

export type Db = ReturnType<typeof createDb>["db"];
