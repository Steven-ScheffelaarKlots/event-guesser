import { configDefaults, defineConfig } from "vitest/config";

// Database tests need Postgres; they run separately via `npm run test:db`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.db.test.ts"] },
});
