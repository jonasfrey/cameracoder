import { expect as f_expect, test as f_test } from "@playwright/test";

f_test(
  "test source, image tools, custom function, freeze, capture, and panels",
  async ({ page: o_page }) => {
    const a_errors = [];
    o_page.on("pageerror", (o_error) => a_errors.push(o_error.message));
    await o_page.goto("/");
    await f_expect(o_page.getByText("Connected", { exact: true })).toBeVisible();
    await o_page.getByRole("button", { name: /Explore with a test source/ }).click();
    await f_expect(o_page.locator(".preview-frame")).toBeVisible();
    await f_expect(o_page.locator(".stage-meta")).toContainText("LIVE");
    await o_page.locator("#n_brightness").fill("40");
    await f_expect(o_page.locator("label[for=n_brightness] output")).toHaveText("40");
    await o_page.getByRole("button", { name: "Filters & effects", exact: true }).click();
    await o_page.getByRole("button", { name: "Edges", exact: true }).click();
    await f_expect(o_page.getByRole("button", { name: "Edges", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await o_page.getByRole("button", { name: "Close Filters & effects", exact: true }).click();
    await o_page.getByRole("button", { name: "Custom function", exact: true }).click();
    await o_page.getByLabel("Red expression", { exact: true }).fill("self.close()");
    await o_page.getByRole("button", { name: "Apply", exact: true }).click();
    await f_expect(o_page.locator(".inline-error")).toBeVisible();
    await o_page.getByLabel("Red expression", { exact: true }).fill("255-r");
    await o_page.getByRole("button", { name: "Apply", exact: true }).click();
    await f_expect(o_page.getByText("Custom expressions active.")).toBeVisible();
    await o_page.getByRole("button", { name: "Close Custom function", exact: true }).click();
    await o_page.getByRole("button", { name: "Rule of thirds", exact: true }).click();
    await f_expect(o_page.locator(".thirds")).toBeVisible();
    await o_page.getByRole("button", { name: "Freeze preview", exact: true }).click();
    await f_expect(o_page.locator(".preview-label")).toHaveText("FROZEN");
    const s_frozen = await o_page.locator("canvas").evaluate((o_canvas) => o_canvas.toDataURL());
    await o_page.waitForTimeout(200);
    f_expect(await o_page.locator("canvas").evaluate((o_canvas) => o_canvas.toDataURL())).toBe(
      s_frozen,
    );
    const o_download_promise = o_page.waitForEvent("download");
    await o_page.getByRole("button", { name: /Capture/ }).click();
    const o_download = await o_download_promise;
    f_expect(o_download.suggestedFilename()).toMatch(/^cameracoder-.*\.png$/);
    await o_download.saveAs("test-results/capture.png");
    await o_page.getByRole("button", { name: "Resume preview", exact: true }).click();
    await o_page.getByRole("button", { name: "Reset workspace", exact: true }).click();
    const o_panel = o_page.getByRole("region", { name: "Camera source", exact: true });
    const o_before = await o_panel.boundingBox();
    const o_header = o_panel.locator(".panel-header");
    await o_header.hover();
    await o_page.mouse.down();
    await o_page.mouse.move(o_before.x + 200, o_before.y + 100);
    await o_page.mouse.up();
    const o_after = await o_panel.boundingBox();
    f_expect(o_after.y).toBeGreaterThan(o_before.y);
    await o_page.getByRole("button", { name: "Reset workspace", exact: true }).click();
    await o_page.screenshot({ path: "test-results/workspace-desktop.png" });
    await o_page.getByRole("button", { name: "Stop camera", exact: true }).click();
    await f_expect(o_page.locator(".stage-meta")).toContainText("STOPPED");
    f_expect(a_errors).toEqual([]);
  },
);

f_test(
  "browser camera permissions, live video, device refresh, and release",
  async ({ page: o_page }) => {
    await o_page.goto("/");
    await o_page.getByRole("button", { name: "Enable camera access", exact: true }).click();
    await f_expect(o_page.locator(".camera-option").filter({ hasText: "fake_device" }))
      .toBeVisible();
    await o_page.locator(".camera-option").filter({ hasText: "fake_device" }).click();
    await o_page.getByRole("button", { name: "Start preview", exact: true }).first().click();
    await f_expect(o_page.locator(".preview-frame")).toBeVisible();
    await f_expect(o_page.locator(".stage-meta")).toContainText("LIVE");
    await f_expect(o_page.locator(".stage-meta")).toContainText("fake_device");
    await o_page.getByRole("button", { name: "Refresh cameras", exact: true }).click();
    await o_page.getByRole("button", { name: "Stop camera", exact: true }).click();
    await f_expect(o_page.locator(".stage-meta")).toContainText("STOPPED");
  },
);

f_test(
  "WebSocket discovery, malformed messages, and invalid device rejection",
  async ({ page: o_page }) => {
    await o_page.goto("/");
    const a_replies = await o_page.evaluate(async () => {
      const o_socket = new WebSocket(`ws://${location.host}/ws`);
      const a_messages = [];
      await new Promise((f_resolve, f_reject) => {
        const n_timer = setTimeout(() => {
          o_socket.close();
          f_reject(new Error("WebSocket timeout"));
        }, 5000);
        o_socket.onopen = () => {
          o_socket.send(JSON.stringify({ s_type: "camera.list" }));
          o_socket.send("{");
          o_socket.send(
            JSON.stringify({
              s_type: "camera.start",
              s_id: "/etc/passwd",
              n_width: 640,
              n_height: 480,
              n_fps: 30,
            }),
          );
          o_socket.send(JSON.stringify({ s_type: "ping" }));
        };
        o_socket.onmessage = (o_event) => {
          const o_message = JSON.parse(o_event.data);
          a_messages.push(o_message);
          if (o_message.s_type === "pong") {
            clearTimeout(n_timer);
            o_socket.close();
            f_resolve();
          }
        };
        o_socket.onerror = f_reject;
      });
      return a_messages;
    });
    f_expect(a_replies.some((o_reply) => o_reply.s_type === "camera.list")).toBe(true);
    f_expect(a_replies.filter((o_reply) => o_reply.s_type === "error")).toHaveLength(2);
  },
);

f_test("small screens keep preview and tool panels usable", async ({ page: o_page }) => {
  await o_page.setViewportSize({ width: 390, height: 844 });
  await o_page.goto("/");
  await o_page.getByRole("button", { name: /Explore with a test source/ }).click();
  await f_expect(o_page.locator(".preview-frame")).toBeVisible();
  await o_page.getByRole("button", { name: "Adjustments", exact: true }).click();
  await f_expect(o_page.getByRole("region", { name: "Adjustments", exact: true })).toBeVisible();
  await o_page.getByRole("button", { name: "Filters & effects", exact: true }).click();
  await f_expect(o_page.getByRole("region", { name: "Adjustments", exact: true })).toBeHidden();
  await o_page.getByRole("button", { name: "Negative", exact: true }).click();
  await f_expect(o_page.getByRole("button", { name: "Negative", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const o_bounds = await o_page.locator(".preview-frame").boundingBox();
  f_expect(o_bounds.width / o_bounds.height).toBeCloseTo(16 / 9, 1);
  await o_page.screenshot({ path: "test-results/workspace-mobile.png" });
  f_expect(await o_page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

f_test(
  "host FFmpeg stream reaches the preview over WebSocket and can restart",
  async ({ page: o_page }) => {
    await o_page.goto("http://127.0.0.1:8788/");
    const o_camera = o_page.locator(".camera-option").filter({ hasText: "FFmpeg test camera" });
    await f_expect(o_camera).toBeVisible();
    await o_camera.click();
    await o_page.getByLabel("Capture size", { exact: true }).selectOption("640x480");
    await o_page.getByRole("button", { name: "Start preview", exact: true }).first().click();
    await f_expect(o_page.locator(".preview-frame")).toBeVisible();
    await f_expect(o_page.locator(".stage-meta")).toContainText("LIVE");
    await f_expect(o_page.locator(".stage-meta")).toContainText("640 × 480");
    await o_page.getByRole("button", { name: "Stop camera", exact: true }).click();
    await f_expect(o_page.locator(".stage-meta")).toContainText("STOPPED");
    await o_page.getByRole("button", { name: "Start preview", exact: true }).click();
    await f_expect(o_page.locator(".stage-meta")).toContainText("LIVE");
    await f_expect(o_page.locator(".error-banner")).toHaveCount(0);
    await o_page.getByRole("button", { name: "Stop camera", exact: true }).click();
  },
);
