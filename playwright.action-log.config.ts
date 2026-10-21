import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

// Never reuse a running server or any existing local/online experiment database.
const run = randomUUID();
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "action-log.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: `test-results/action-log-${run}`,
  use: {
    baseURL: "http://127.0.0.1:3187",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.E2E_CHANNEL || undefined,
      },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3187",
    url: "http://127.0.0.1:3187",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
      REALTIME_DATABASE_URL: "",
      LOCAL_DATABASE_URL: "",
      VERCEL: "",
      TEACHER_ACCESS_KEY: "",
      PGLITE_DATA_DIR: path.join(tmpdir(), `double-auction-action-log-${run}`),
      LOCAL_NEXT_DIST_DIR: `.next/action-log-${run}`,
    },
  },
});
