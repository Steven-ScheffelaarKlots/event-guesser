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
