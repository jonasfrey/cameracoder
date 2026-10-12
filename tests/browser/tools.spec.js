import { expect as f_expect, test as f_test } from "@playwright/test";
import { o_defaults } from "../../shared/settings.js";

async function f_search(o_page, s_query) {
  await o_page.getByRole("button", { name: "Search controls and commands", exact: true }).click();
  const o_search = o_page.getByRole("combobox", { name: "Search controls and commands" });
  await o_search.fill(s_query);
  return o_search;
}

f_test(
  "palette covers every image input, reveals controls, and supports keyboard focus",
  async ({ page: o_page }) => {
    await o_page.goto("/");
    await o_page.locator("#n_brightness").focus();
    await o_page.keyboard.press("Control+Shift+P");
    const o_dialog = o_page.getByRole("dialog", { name: "Find a tool" });
    const o_search = o_page.getByRole("combobox", { name: "Search controls and commands" });
    await f_expect(o_dialog).toBeVisible();
    await f_expect(o_search).toBeFocused();
    const a_ids = await o_dialog.locator("[data-tool]").evaluateAll((a_nodes) =>
      a_nodes.map((o_node) => o_node.dataset.tool)
    );
    for (const s_key of Object.keys(o_defaults)) f_expect(a_ids).toContain(s_key);
    for (
      const s_id of [
        "capture-size",
        "frame-rate",
        "process-width",
        "camera-source",
        "expression-0",
        "expression-1",
        "expression-2",
        "grid",
        "freeze",
        "fullscreen",
        "capture",
        "start",
        "stop",
        "permission",
        "refresh",
        "reset-workspace",
      ]
    ) {
      f_expect(a_ids).toContain(s_id);
    }
    await o_search.fill("gamma");
    await o_search.press("ArrowDown");
    await f_expect(o_search).toHaveAttribute("aria-activedescendant", "search-result-1");
    await o_search.press("ArrowUp");
    await o_search.press("Enter");
    await f_expect(o_dialog).not.toBeVisible();
    await f_expect(o_page.locator("#n_curve")).toBeFocused();
    await o_page.locator("#n_curve").fill("1.5");
    await f_expect(o_page.getByRole("button", { name: "Remove Curve · gamma", exact: true }))
      .toBeVisible();

    await o_page.keyboard.press("Control+Shift+P");
    await o_search.fill("overexposure");
    await o_search.press("Enter");
    await f_expect(o_page.locator("#over")).toBeFocused();
    await f_expect(o_page.locator("#exposure")).toHaveValue("off");
    await o_page.locator("#over").fill("211");
    await o_page.keyboard.press("Control+Shift+P");
    await o_search.fill("nothing-matches-this");
    await f_expect(o_dialog.getByText(/No matching tools/)).toBeVisible();
    await o_search.press("Enter");
    await f_expect(o_dialog).toBeVisible();
    await o_search.press("Escape");
    await f_expect(o_dialog).not.toBeVisible();
    await f_expect(o_page.locator("#over")).toBeFocused();
    await f_expect(o_page.getByRole("region", { name: "Image inspection", exact: true }))
      .toBeVisible();

    await o_page.keyboard.press("Meta+Shift+P");
    await f_expect(o_search).toBeFocused();
    await o_search.press("Tab");
    await f_expect(o_dialog.getByRole("button", { name: "Close search" })).toBeFocused();
    await o_page.keyboard.press("Escape");
  },
);

f_test(
  "persisted and live changes can be removed independently without opening panels",
  async ({ page: o_page }) => {
    await o_page.addInitScript(() =>
      localStorage.setItem(
        "cameracoder.v1",
        JSON.stringify({
          o_settings: {
            n_brightness: 35,
            s_filter: "edge",
            n_rgb: 8,
            n_trace: .4,
            s_exposure: "zebra",
            n_under: 32,
            s_focus: "red",
            b_mirror: true,
          },
        }),
      )
    );
    await o_page.goto("/");
    const o_changes = o_page.getByRole("region", { name: "Active settings", exact: true });
    await f_expect(o_changes.locator("button")).toHaveCount(8);
    await o_page.getByRole("button", { name: "Close Camera source", exact: true }).click();
    await o_page.getByRole("button", { name: "Close Adjustments", exact: true }).click();
    await o_changes.getByRole("button", { name: "Remove Image filter", exact: true }).click();
    await f_expect(o_changes.getByRole("button", { name: "Remove Image filter", exact: true }))
      .toHaveCount(0);
    await f_expect(o_changes.getByRole("button", { name: "Remove Brightness", exact: true }))
      .toBeVisible();
    await f_expect(o_page.locator(".panel:visible")).toHaveCount(0);
    await f_expect.poll(() =>
      o_page.evaluate(() => JSON.parse(localStorage.getItem("cameracoder.v1")).o_settings.s_filter)
    ).toBe("none");
    await f_expect.poll(() =>
      o_page.evaluate(() =>
        JSON.parse(localStorage.getItem("cameracoder.v1")).o_settings.n_brightness
      )
    ).toBe(35);
    for (
      const s_label of [
        "Brightness",
        "RGB offset",
        "Exposure warning",
        "Underexposure threshold",
        "Focus peaking",
        "Trace persistence",
        "Mirror preview",
      ]
    ) {
      await o_changes.getByRole("button", { name: `Remove ${s_label}`, exact: true }).click();
    }
    await f_expect(o_changes.locator("button")).toHaveCount(0);
    await f_expect(
      o_page.getByRole("button", { name: "Search controls and commands", exact: true }),
    ).toBeFocused();
    await f_expect.poll(() =>
      o_page.evaluate(() => JSON.parse(localStorage.getItem("cameracoder.v1")).o_settings)
    ).toEqual(o_defaults);

    await (await f_search(o_page, "brightness")).press("Enter");
    await o_page.locator("#n_brightness").fill("20");
    await o_page.locator("#n_brightness").fill("0");
    await f_expect(o_changes.locator("button")).toHaveCount(0);
  },
);

f_test(
  "search can apply effects and custom expression changes reset by channel",
  async ({ page: o_page }) => {
    await o_page.goto("/");
    await (await f_search(o_page, "Edges")).press("Enter");
    await f_expect(o_page.getByRole("button", { name: "Remove Image filter", exact: true }))
      .toContainText("Edges");
    await (await f_search(o_page, "Red expression")).press("Enter");
    await o_page.locator("#expression-0").fill("255-r");
    await o_page.locator("#expression-1").fill("255-g");
    await f_expect(o_page.getByRole("button", { name: "Remove Red expression", exact: true }))
      .toContainText("draft");
    await o_page.getByRole("button", { name: "Apply", exact: true }).click();
    await f_expect(o_page.getByRole("button", { name: "Remove Custom function", exact: true }))
      .toBeVisible();
    await o_page.getByRole("button", { name: "Close Custom function", exact: true }).click();
    await o_page.getByRole("button", { name: "Remove Red expression", exact: true }).click();
    await f_expect(o_page.getByRole("button", { name: "Remove Green expression", exact: true }))
      .toContainText("255-g");
    await f_expect(o_page.locator("#expression-0")).toHaveValue("r");
    await o_page.getByRole("button", { name: "Remove Custom function", exact: true }).click();
    await f_expect(o_page.getByRole("button", { name: /Remove .* expression/ })).toHaveCount(0);
    await f_expect(o_page.locator("#expression-1")).toHaveValue("g");
    await f_expect(o_page.getByRole("button", { name: "Remove Image filter", exact: true }))
      .toBeVisible();
  },
);

f_test(
  "capture and preview changes expose resets and unavailable actions stay safe",
  async ({ page: o_page }) => {
    await o_page.goto("/");
    const o_search = await f_search(o_page, "Capture PNG");
    await f_expect(o_page.locator('[data-tool="capture"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await o_search.press("Enter");
    await f_expect(o_page.getByRole("dialog")).toBeVisible();
    await o_search.fill("Process width");
    await o_search.press("Enter");
    await o_page.locator("#quality").selectOption("480");
    await o_page.locator("#resolution").selectOption("640x480");
    await o_page.locator("#framerate").selectOption("15");
    await o_page.getByRole("button", { name: "Rule of thirds", exact: true }).click();
    await o_page.getByRole("button", { name: /Explore with a test source/ }).click();
    await f_expect(o_page.locator(".stage-meta")).toContainText("LIVE");
    await f_expect(o_page.locator(".preview-frame")).toBeVisible();
    await o_page.getByRole("button", { name: "Remove Capture size", exact: true }).click();
    await f_expect(o_page.locator(".stage-meta")).toContainText("STOPPED");
    await f_expect(o_page.locator("#resolution")).toHaveValue("1280x720");
    await f_expect(o_page.locator("#quality")).toHaveValue("480");
    await o_page.getByRole("button", { name: "Remove Process width", exact: true }).click();
    await f_expect(o_page.locator("#quality")).toHaveValue("960");
    await o_page.getByRole("button", { name: "Remove Frame rate", exact: true }).click();
    await f_expect(o_page.locator("#framerate")).toHaveValue("30");
    await o_page.getByRole("button", { name: "Remove Rule of thirds", exact: true }).click();
    await f_expect(o_page.getByRole("button", { name: "Rule of thirds", exact: true }))
      .toHaveAttribute("aria-pressed", "false");
  },
);

f_test("search and removable changes remain usable on a phone", async ({ page: o_page }) => {
  await o_page.setViewportSize({ width: 390, height: 844 });
  await o_page.goto("/");
  await (await f_search(o_page, "Twist")).press("Enter");
  await f_expect(o_page.locator("#twist")).toBeFocused();
  await o_page.locator("#twist").fill("2");
  await o_page.getByRole("button", { name: "Close Filters & effects", exact: true }).click();
  await o_page.getByRole("button", { name: "Remove Twist", exact: true }).click();
  await f_expect(o_page.locator("#twist")).toHaveValue("0");
  await f_search(o_page, "exposure");
  await o_page.screenshot({ path: "test-results/tool-search-mobile.png" });
  const o_bounds = await o_page.getByRole("dialog").boundingBox();
  f_expect(o_bounds.x).toBeGreaterThanOrEqual(0);
  f_expect(o_bounds.x + o_bounds.width).toBeLessThanOrEqual(390);
  f_expect(await o_page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});
