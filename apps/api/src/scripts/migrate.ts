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
