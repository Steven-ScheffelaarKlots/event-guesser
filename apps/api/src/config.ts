import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Optional repo-root .env; real environment variables still win.
const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://chronodle:chronodle@localhost:5434/chronodle";
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://chronodle:chronodle@localhost:5434/chronodle_test";
export const PORT = Number(process.env.PORT ?? 3000);
// Localhost only by default: the admin routes have no authentication.
export const HOST = process.env.HOST ?? "127.0.0.1";

// Production server only (src/server.ts): the admin gets its own port, never exposed publicly.
export const ADMIN_PORT = Number(process.env.ADMIN_PORT ?? 3001);
// Built frontends (`npm run build`).
export const GAME_DIR = process.env.GAME_DIR ?? fileURLToPath(new URL("../../game/dist", import.meta.url));
export const ADMIN_DIR = process.env.ADMIN_DIR ?? fileURLToPath(new URL("../../admin/dist", import.meta.url));
