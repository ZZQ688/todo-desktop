import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:1420", trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://127.0.0.1:1420", reuseExistingServer: false },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    { name: "narrow", use: { browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
});
