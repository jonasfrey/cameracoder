import { defineConfig as f_define_config } from "@playwright/test";

export default f_define_config({
  testDir: "./tests/browser",
  timeout: 30000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8787",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      args: [
        "--no-sandbox",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
  },
  webServer: [{
    command: "deno task start",
    env: { PORT: "8787" },
    url: "http://127.0.0.1:8787/health",
    reuseExistingServer: false,
    timeout: 15000,
  }, {
    command:
      "deno run --allow-net=127.0.0.1:8788 --allow-read=. --allow-run=ffmpeg tests/browser/host_fixture.js",
    url: "http://127.0.0.1:8788/health",
    reuseExistingServer: false,
    timeout: 15000,
  }],
});
