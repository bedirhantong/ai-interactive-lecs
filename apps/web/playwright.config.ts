import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests in real Chrome. They need network access: Pyodide and
 * Monaco are loaded from jsDelivr, exactly as in production.
 *
 * By default a dev server is started on port 3100. Next.js allows one dev server
 * per folder, so if `npm run dev` is already running, test against it instead:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test
 */
const externalServer = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: externalServer ?? "http://localhost:3100",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: externalServer
    ? undefined
    : {
        command: "npx next dev -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
