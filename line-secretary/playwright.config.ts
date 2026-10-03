import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:8788",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  webServer: {
    command: "PORT=8788 MOCK_DB=:memory: npm run mock",
    url: "http://localhost:8788/api/health",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
