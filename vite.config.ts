import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

// Base-path is conditional:
//   - In PROD build: `/dispatch/` because nginx serves the SPA under that
//     prefix (same server hosts several portals side-by-side).
//   - In DEV: `/` so http://localhost:3005/login opens the app directly.
//     Previously `base: "/dispatch/"` forced devs to type /dispatch/login
//     locally AND broke React Router links rendered from memory.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/dispatch/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3005, // Dispatch Portal on 3005, Owner Panel on 3004
    host: true,
  },
}));
