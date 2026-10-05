import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin API calls in dev; the API runs on :3000 (npm run dev at the root).
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
