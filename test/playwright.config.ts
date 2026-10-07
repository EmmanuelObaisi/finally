import path from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:8000" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  // Start a local backend only when no external BASE_URL (e.g. the container) is given.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "uv run uvicorn --factory app.main:create_app --port 8000",
        cwd: path.join(__dirname, "..", "backend"),
        url: "http://localhost:8000/api/health",
        reuseExistingServer: false,
        timeout: 60000,
        env: { STATIC_DIR: path.join(__dirname, "..", "frontend", "out") },
      },
});
