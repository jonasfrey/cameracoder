import {
  f_compile_custom,
  f_compile_expression,
  f_histogram,
  f_process_frame,
} from "../shared/filters.js";
import { f_normalize_settings } from "../shared/settings.js";

function f_equal(o_actual, o_expected) {
  if (JSON.stringify(o_actual) !== JSON.stringify(o_expected)) {
    throw new Error(`Expected ${JSON.stringify(o_expected)}, got ${JSON.stringify(o_actual)}`);
  }
}
function f_assert(b_condition, s_message) {
  if (!b_condition) throw new Error(s_message);
}
function f_throws(f_action) {
  try {
    f_action();
  } catch {
    return;
  }
  throw new Error("Expected rejection");
}
const f_pixels = (...a_rgb) => new Uint8ClampedArray(a_rgb.flatMap((a_color) => [...a_color, 255]));
const f_process = (a_data, o_settings, o_history = {}, n_width = a_data.length / 4) =>
  f_process_frame(a_data, n_width, a_data.length / 4 / n_width, o_settings, o_history);

Deno.test("neutral pipeline and bypass preserve channel values", () => {
  const a_input = f_pixels([0, 25, 255], [128, 64, 32]);
  f_equal([...f_process(a_input, {})], [...a_input]);
  f_equal([...f_process(a_input, { n_brightness: 100, s_filter: "invert", b_bypass: true })], [
    ...a_input,
  ]);
  f_equal([...a_input], [0, 25, 255, 255, 128, 64, 32, 255]);
});
Deno.test("tone controls clamp, lift shadows, and map gamma", () => {
  f_equal([...f_process(f_pixels([10, 100, 240]), { n_brightness: 100 })], [255, 255, 255, 255]);
  f_equal([...f_process(f_pixels([10, 100, 240]), { n_brightness: -100 })], [0, 0, 0, 255]);
  const a_gamma = f_process(f_pixels([64, 64, 64]), { n_curve: 2 });
  f_assert(a_gamma[0] >= 127 && a_gamma[0] <= 128, "Gamma lifts midtones");
  const a_shadows = f_process(f_pixels([0, 255, 128]), { n_shadows: 50 });
  f_equal(a_shadows[0], 50);
  f_equal(a_shadows[1], 255);
  f_equal(f_process(f_pixels([0, 255, 128]), { n_lights: -50 })[1], 205);
});
Deno.test("mirror and RGB offset sample within image boundaries", () => {
  const a_input = f_pixels([10, 20, 30], [40, 50, 60], [70, 80, 90]);
  f_equal([...f_process(a_input, { b_mirror: true })], [
    ...f_pixels([70, 80, 90], [40, 50, 60], [10, 20, 30]),
  ]);
  f_equal([...f_process(a_input, { n_rgb: 1 })], [
    ...f_pixels([40, 20, 30], [70, 50, 30], [70, 80, 60]),
  ]);
});
Deno.test("spatial filters and diagnostic overlays", () => {
  const a_flat = f_pixels(...Array(9).fill([100, 100, 100]));
  f_equal(f_process(a_flat, { s_filter: "emboss" }, {}, 3)[16], 128);
  f_equal(f_process(a_flat, { s_filter: "edge" }, {}, 3)[16], 0);
  f_equal([...f_process(f_pixels([0, 255, 100]), { s_filter: "invert" })], [255, 0, 155, 255]);
  f_equal([...f_process(f_pixels([0, 0, 0], [255, 255, 255]), { s_exposure: "solid" })], [
    0,
    0,
    0,
    255,
    255,
    255,
    255,
    255,
  ]);
  const a_edges = f_pixels(
    ...Array.from({ length: 9 }, (_, n_i) => n_i % 3 ? [255, 255, 255] : [0, 0, 0]),
  );
  f_equal([...f_process(a_edges, { s_focus: "red", n_focus: 20 }, {}, 3).slice(16, 20)], [
    255,
    0,
    0,
    255,
  ]);
  const a_twisted = f_process(a_edges, { n_twist: 4 }, {}, 3);
  f_assert(
    a_twisted.every((n_value, n_i) => n_i % 4 !== 3 || n_value === 255),
    "Twist preserves alpha",
  );
});
Deno.test("trace history blends frames and resets when dimensions change", () => {
  const o_history = {};
  f_process(f_pixels([100, 100, 100]), { n_trace: 0.5 }, o_history);
  f_equal([...f_process(f_pixels([200, 200, 200]), { n_trace: 0.5 }, o_history)], [
    150,
    150,
    150,
    255,
  ]);
  f_equal([...f_process(f_pixels([0, 0, 0], [0, 0, 0]), { n_trace: 0.5 }, o_history)], [
    0,
    0,
    0,
    255,
    0,
    0,
    0,
    255,
  ]);
});
Deno.test("motion-only processing preserves static pixels", () => {
  const o_history = {};
  const o_settings = { s_filter: "invert", n_motion: 20, b_motion_only: true };
  const a_first = f_pixels([40, 40, 40], [60, 60, 60]);
  f_equal([...f_process(a_first, o_settings, o_history)], [...a_first]);
  f_equal([...f_process(f_pixels([40, 40, 40], [120, 120, 120]), o_settings, o_history)], [
    40,
    40,
    40,
    255,
    135,
    135,
    135,
    255,
  ]);
  const o_spatial_history = {};
  const o_spatial_settings = {
    n_motion: 20,
    b_motion_only: true,
    n_rgb: 1,
    n_trace: 0.5,
    s_exposure: "zebra",
    n_under: 100,
  };
  f_process(a_first, o_spatial_settings, o_spatial_history);
  f_equal([...f_process(a_first, o_spatial_settings, o_spatial_history)], [...a_first]);
});
Deno.test("custom channel expressions support math without arbitrary code", () => {
  const a_values = [100, 120, 80, .5, .2, 2, 110];
  f_equal(f_compile_expression("clamp(r * 2 + 5, 0, 255)")(a_values), 205);
  f_equal(f_compile_expression("2 ** 3 ** 2")([]), 512);
  f_equal(f_compile_expression("mix(r, g, x)")(a_values), 110);
  f_equal(f_compile_expression("1 / 0")([]), 0);
  for (
    const s_expression of [
      "self.close()",
      "fetch('x')",
      "while(true){}",
      "constructor",
      "r;g",
      "max(r)",
      "r +",
      "",
      "sin(".repeat(30),
    ]
  ) {
    f_throws(() => f_compile_expression(s_expression));
  }
  const a_custom = f_compile_custom(["255-r", "b", "g"]);
  f_equal([...f_process_frame(f_pixels([10, 20, 30]), 1, 1, {}, {}, a_custom)], [245, 30, 20, 255]);
});
Deno.test("settings normalize corrupt persistence; histogram samples luminance", () => {
  const o_normal = f_normalize_settings({
    n_brightness: Infinity,
    n_contrast: 900,
    n_curve: "2",
    s_filter: "bad",
    b_bypass: "true",
  });
  f_equal(o_normal.n_brightness, 0);
  f_equal(o_normal.n_contrast, 100);
  f_equal(o_normal.n_curve, 1);
  f_equal(o_normal.s_filter, "none");
  f_equal(o_normal.b_bypass, false);
  const a_histogram = f_histogram(f_pixels(...Array(8).fill([255, 255, 255])));
  f_equal(a_histogram[63], 2);
  f_throws(() => f_process_frame(new Uint8ClampedArray(3), 1, 1, {}));
});
