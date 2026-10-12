import { expect as f_expect, test as f_test } from "@playwright/test";

f_test(
  "GLSL worker matches reference filters, orientation, expressions, and temporal history",
  async ({ page: o_page }) => {
    await o_page.goto("/");
    // Fail if live processing requests CPU image access or full-frame readback.
    await o_page.route("**/worker.js", async (o_route) => {
      const o_response = await o_route.fetch();
      await o_route.fulfill({
        response: o_response,
        body: `
      const f_context = OffscreenCanvas.prototype.getContext;
      OffscreenCanvas.prototype.getContext = function(s_kind, ...a_args) {
        if (s_kind !== "webgl2") throw new Error("Expected WebGL2 processing");
        return f_context.call(this, s_kind, ...a_args);
      };
      const f_read = WebGL2RenderingContext.prototype.readPixels;
      WebGL2RenderingContext.prototype.readPixels = function(...a_args) {
        if (a_args[2] > 64 || a_args[3] > 36) throw new Error("Full-frame readback");
        return f_read.apply(this, a_args);
      };
      ${await o_response.text()}`,
      });
    });
    const a_results = await o_page.evaluate(async () => {
      const { f_process_frame, f_compile_custom } = await import("/shared/filters.js");
      const o_worker = new Worker("/worker.js", { type: "module" });
      const o_read = new OffscreenCanvas(1, 1);
      const o_context = o_read.getContext("2d", { willReadFrequently: true });
      const a_results = [];
      let n_generation = 0, o_history = {};
      async function f_check(
        s_name,
        o_settings = {},
        a_custom = null,
        b_reset = true,
        n_frame = 0,
        n_width = 17,
        n_height = 11,
      ) {
        if (b_reset) {
          n_generation++;
          o_history = {};
        }
        const a_input = new Uint8ClampedArray(n_width * n_height * 4);
        for (let n_y = 0; n_y < n_height; n_y++) {
          for (let n_x = 0; n_x < n_width; n_x++) {
            const n_i = (n_y * n_width + n_x) * 4;
            for (let n_c = 0; n_c < 3; n_c++) {
              a_input[n_i + n_c] = (n_x * 13 + n_y * 31 + n_c * 53 + (n_x % 3 ? n_frame * 47 : 0)) %
                256;
            }
            a_input[n_i + 3] = 255;
          }
        }
        const a_expected = f_process_frame(
          a_input,
          n_width,
          n_height,
          o_settings,
          o_history,
          a_custom ? f_compile_custom(a_custom) : null,
          2.5,
        );
        const o_bitmap = await createImageBitmap(new ImageData(a_input, n_width, n_height));
        const o_result = await new Promise((f_resolve, f_reject) => {
          const n_timer = setTimeout(() => f_reject(new Error(`Worker timeout: ${s_name}`)), 5000);
          o_worker.onerror = (o_error) => {
            clearTimeout(n_timer);
            f_reject(new Error(o_error.message));
          };
          o_worker.onmessage = ({ data: o_data }) => {
            clearTimeout(n_timer);
            if (o_data.s_error) f_reject(new Error(`${s_name}: ${o_data.s_error}`));
            else f_resolve(o_data);
          };
          o_worker.postMessage({
            o_bitmap,
            n_width,
            n_height,
            n_generation,
            o_settings,
            a_custom,
            n_time: 2.5,
          }, [o_bitmap]);
        });
        o_read.width = n_width;
        o_read.height = n_height;
        o_context.drawImage(o_result.o_bitmap, 0, 0);
        o_result.o_bitmap.close();
        const a_actual = o_context.getImageData(0, 0, n_width, n_height).data;
        let n_difference = 0;
        for (let n_i = 0; n_i < a_actual.length; n_i++) {
          n_difference = Math.max(n_difference, Math.abs(a_expected[n_i] - a_actual[n_i]));
        }
        a_results.push({
          s_name,
          n_difference,
          n_samples: o_result.a_histogram.reduce((n_a, n_b) => n_a + n_b, 0),
          n_expected_samples: Math.min(64, n_width) * Math.min(36, n_height),
        });
      }
      try {
        await f_check("neutral / orientation");
        await f_check("mirror", { b_mirror: true });
        await f_check("bypass", { b_bypass: true, b_mirror: true, s_filter: "invert", n_twist: 3 });
        for (
          const o_settings of [
            { n_brightness: 35 },
            { n_brightness: -100 },
            { n_brightness: 100 },
            { n_contrast: 43 },
            { n_curve: 1.7 },
            { n_shadows: 63, n_lights: -42 },
            { n_rgb: 3 },
            { n_rgb: 40 },
            { n_twist: 2.3 },
            { n_twist: -4, b_mirror: true },
            ...["edge", "emboss", "mono", "invert"].map((s_filter) => ({ s_filter })),
            ...["red", "green", "blue"].map((s_focus) => ({ s_focus, n_focus: 26 })),
            { s_exposure: "zebra", n_under: 60, n_over: 190 },
            { s_exposure: "solid", n_under: 60, n_over: 190 },
            {
              n_brightness: 12,
              n_contrast: -7,
              n_curve: 1.4,
              n_twist: 1.2,
              n_rgb: 2,
              s_filter: "emboss",
            },
          ]
        ) await f_check(JSON.stringify(o_settings), o_settings);
        for (
          const a_custom of [
            ["255-r", "b", "g"],
            ["x*255", "y*255", "t*20+l/3"],
            ["clamp(r*2+5,0,255)", "mix(g,b,x)", "step(128,l)*255"],
            ["round(sin(pi*x)*100+100)", "abs(cos(t))*255", "sqrt(r)*10"],
            ["min(r,g)+max(g,b)/2", "floor(r/3)+ceil(g/3)", "2**3**2"],
            ["100+(-5%3)*10", "100+pow(-2,3)", "1/0+10"],
            ["sqrt(-1)", "pow(-2,.5)", "clamp(sqrt(-1),10,100)"],
          ]
        ) await f_check(`custom ${a_custom}`, {}, a_custom);
        for (
          const o_settings of [
            { n_motion: 20 },
            { n_trace: .5 },
            { n_motion: 20, b_motion_only: true, s_filter: "invert" },
            {
              n_motion: 20,
              b_motion_only: true,
              b_mirror: true,
              n_twist: 3,
              n_trace: .5,
              s_exposure: "zebra",
            },
          ]
        ) {
          await f_check(`history seed ${JSON.stringify(o_settings)}`, o_settings);
          await f_check("history changed", o_settings, null, false, 1);
          await f_check("history unchanged", o_settings, null, false, 1);
          await f_check("history bypass", { ...o_settings, b_bypass: true }, null, false, 2);
          await f_check("history after bypass", o_settings, null, false, 3);
          await f_check("history resize", o_settings, null, false, 1, 13, 7);
          await f_check("history generation", o_settings, null, true, 2, 13, 7);
          await f_check("history disabled", {}, null, false, 2, 13, 7);
          await f_check("history reenabled", o_settings, null, false, 3, 13, 7);
        }
        await f_check(
          "large frame / bounded histogram",
          { s_filter: "invert" },
          null,
          true,
          0,
          128,
          72,
        );
        await f_check("single pixel", { s_filter: "edge", n_twist: 2 }, null, true, 0, 1, 1);
        return a_results;
      } finally {
        o_worker.terminate();
      }
    });
    for (const o_result of a_results) {
      f_expect(o_result.n_difference, o_result.s_name).toBeLessThanOrEqual(2);
      f_expect(o_result.n_samples, o_result.s_name).toBe(o_result.n_expected_samples);
    }
  },
);

f_test(
  "GPU initialization and context loss report recoverable errors",
  async ({ page: o_page }) => {
    await o_page.goto("/");
    const a_errors = await o_page.evaluate(async () => {
      const { O_gpu_processor } = await import("/gpu.js");
      const a_errors = [];
      try {
        new O_gpu_processor({ getContext: () => null });
      } catch (o_error) {
        a_errors.push(o_error.message);
      }
      const o_processor = new O_gpu_processor();
      const o_bitmap = await createImageBitmap(new ImageData(2, 2));
      try {
        o_processor.o_gl.getExtension("WEBGL_lose_context").loseContext();
        try {
          o_processor.f_render(o_bitmap, 2, 2, {});
        } catch (o_error) {
          a_errors.push(o_error.message);
        }
      } finally {
        o_bitmap.close();
        o_processor.f_dispose();
      }
      return a_errors;
    });
    f_expect(a_errors[0]).toContain("WebGL2 is unavailable");
    f_expect(a_errors[1]).toContain("context lost");
  },
);
