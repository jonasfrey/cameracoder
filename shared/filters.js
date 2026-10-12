import { f_normalize_settings } from "./settings.js";
export { f_compile_custom, f_compile_expression } from "./expressions.js";

export const f_clamp = (n_value, n_min = 0, n_max = 255) =>
  Math.min(n_max, Math.max(n_min, Number.isFinite(n_value) ? n_value : 0));

// CPU reference implementation for parity tests; live processing uses WebGL.
export function f_histogram(a_data) {
  const a_bins = new Uint32Array(64);
  for (let n_i = 0; n_i < a_data.length; n_i += 16) {
    const n_luma = a_data[n_i] * 0.2126 + a_data[n_i + 1] * 0.7152 + a_data[n_i + 2] * 0.0722;
    a_bins[Math.min(63, Math.floor(n_luma / 4))]++;
  }
  return Array.from(a_bins);
}

export function f_process_frame(
  a_input,
  n_width,
  n_height,
  o_input,
  o_history = {},
  a_custom = null,
  n_time = 0,
) {
  if (a_input.length !== n_width * n_height * 4 || n_width < 1 || n_height < 1) {
    throw new Error("Invalid frame dimensions.");
  }
  const o_settings = f_normalize_settings(o_input);
  const n_length = a_input.length;
  if (o_history.n_width !== n_width || o_history.n_height !== n_height) {
    o_history.a_previous = null;
    o_history.a_trace = null;
    o_history.n_width = n_width;
    o_history.n_height = n_height;
  }
  const a_output = new Uint8ClampedArray(n_length);
  const a_spatial = new Uint8ClampedArray(n_length);
  const n_radius = Math.min(n_width, n_height) / 2;
  for (let n_y = 0; n_y < n_height; n_y++) {
    for (let n_x = 0; n_x < n_width; n_x++) {
      let n_sx = o_settings.b_mirror ? n_width - 1 - n_x : n_x;
      let n_sy = n_y;
      if (o_settings.n_twist && !o_settings.b_bypass) {
        const n_dx = (n_sx - n_width / 2) / n_radius;
        const n_dy = (n_sy - n_height / 2) / n_radius;
        const n_distance = Math.hypot(n_dx, n_dy);
        const n_angle = Math.atan2(n_dy, n_dx) +
          o_settings.n_twist * Math.max(0, 1 - n_distance) ** 2;
        n_sx = Math.round(
          f_clamp(n_width / 2 + Math.cos(n_angle) * n_distance * n_radius, 0, n_width - 1),
        );
        n_sy = Math.round(
          f_clamp(n_height / 2 + Math.sin(n_angle) * n_distance * n_radius, 0, n_height - 1),
        );
      }
      const n_i = (n_y * n_width + n_x) * 4;
      const n_source = (n_sy * n_width + n_sx) * 4;
      const n_offset = o_settings.b_bypass ? 0 : Math.round(o_settings.n_rgb);
      a_spatial[n_i] = a_input[(n_sy * n_width + Math.min(n_width - 1, n_sx + n_offset)) * 4];
      a_spatial[n_i + 1] = a_input[n_source + 1];
      a_spatial[n_i + 2] = a_input[(n_sy * n_width + Math.max(0, n_sx - n_offset)) * 4 + 2];
      a_spatial[n_i + 3] = 255;
    }
  }
  if (o_settings.b_bypass) {
    o_history.a_previous = null;
    o_history.a_trace = null;
    return a_spatial;
  }
  const a_lut = new Uint8ClampedArray(256);
  const n_contrast = (100 + o_settings.n_contrast) / Math.max(1, 100 - o_settings.n_contrast);
  for (let n_i = 0; n_i < 256; n_i++) {
    const n_value = n_i / 255;
    const n_tone = n_i + o_settings.n_shadows * (1 - n_value) ** 2 +
      o_settings.n_lights * n_value ** 2;
    const n_adjusted = f_clamp((n_tone - 128) * n_contrast + 128 + o_settings.n_brightness * 2.55);
    a_lut[n_i] = 255 * Math.pow(n_adjusted / 255, 1 / o_settings.n_curve);
  }
  const a_luma = new Float32Array(n_length / 4);
  for (let n_i = 0; n_i < n_length; n_i += 4) {
    for (let n_c = 0; n_c < 3; n_c++) a_output[n_i + n_c] = a_lut[a_spatial[n_i + n_c]];
    a_output[n_i + 3] = 255;
    a_luma[n_i / 4] = 0.2126 * a_output[n_i] + 0.7152 * a_output[n_i + 1] +
      0.0722 * a_output[n_i + 2];
  }
  const a_values = new Float64Array(7);
  a_values[5] = n_time;
  for (let n_y = 0; n_y < n_height; n_y++) {
    for (let n_x = 0; n_x < n_width; n_x++) {
      const n_p = n_y * n_width + n_x, n_i = n_p * 4;
      const n_luma = a_luma[n_p];
      let n_edge = 0;
      if (o_settings.s_filter === "edge" || o_settings.s_focus !== "off") {
        const n_x0 = Math.max(0, n_x - 1), n_x1 = Math.min(n_width - 1, n_x + 1);
        const n_y0 = Math.max(0, n_y - 1) * n_width,
          n_y1 = Math.min(n_height - 1, n_y + 1) * n_width;
        const n_gx = -a_luma[n_y0 + n_x0] + a_luma[n_y0 + n_x1] - 2 * a_luma[n_y * n_width + n_x0] +
          2 * a_luma[n_y * n_width + n_x1] - a_luma[n_y1 + n_x0] + a_luma[n_y1 + n_x1];
        const n_gy = -a_luma[n_y0 + n_x0] - 2 * a_luma[n_y0 + n_x] - a_luma[n_y0 + n_x1] +
          a_luma[n_y1 + n_x0] + 2 * a_luma[n_y1 + n_x] + a_luma[n_y1 + n_x1];
        n_edge = Math.hypot(n_gx, n_gy) / 4;
      }
      if (
        o_settings.s_filter === "edge" || o_settings.s_filter === "mono" ||
        o_settings.s_filter === "emboss"
      ) {
        const n_value = o_settings.s_filter === "edge"
          ? n_edge
          : o_settings.s_filter === "mono"
          ? n_luma
          : 128 + (n_luma - a_luma[Math.max(0, n_y - 1) * n_width + Math.max(0, n_x - 1)]) * 2;
        a_output[n_i] = a_output[n_i + 1] = a_output[n_i + 2] = n_value;
      } else if (o_settings.s_filter === "invert") {
        for (let n_c = 0; n_c < 3; n_c++) a_output[n_i + n_c] = 255 - a_output[n_i + n_c];
      }
      if (a_custom) {
        for (let n_c = 0; n_c < 3; n_c++) a_values[n_c] = a_output[n_i + n_c];
        a_values[3] = n_x / Math.max(1, n_width - 1);
        a_values[4] = n_y / Math.max(1, n_height - 1);
        a_values[6] = n_luma;
        for (let n_c = 0; n_c < 3; n_c++) a_output[n_i + n_c] = f_clamp(a_custom[n_c](a_values));
      }
      const n_raw_i = (n_y * n_width + (o_settings.b_mirror ? n_width - 1 - n_x : n_x)) * 4;
      const b_motion = !!o_history.a_previous && Math.max(
            Math.abs(a_input[n_raw_i] - o_history.a_previous[n_raw_i]),
            Math.abs(a_input[n_raw_i + 1] - o_history.a_previous[n_raw_i + 1]),
            Math.abs(a_input[n_raw_i + 2] - o_history.a_previous[n_raw_i + 2]),
          ) > o_settings.n_motion;
      if (o_settings.n_trace && o_history.a_trace) {
        for (let n_c = 0; n_c < 3; n_c++) {
          a_output[n_i + n_c] = a_output[n_i + n_c] * (1 - o_settings.n_trace) +
            o_history.a_trace[n_i + n_c] * o_settings.n_trace;
        }
      }
      if (o_settings.n_motion > 0 && b_motion && !o_settings.b_motion_only) {
        a_output[n_i] *= 0.5;
        a_output[n_i + 1] = a_output[n_i + 1] * 0.5 + 127;
        a_output[n_i + 2] = a_output[n_i + 2] * 0.5 + 100;
      }
      if (o_settings.s_focus !== "off" && n_edge > o_settings.n_focus) {
        a_output[n_i] = o_settings.s_focus === "red" ? 255 : 0;
        a_output[n_i + 1] = o_settings.s_focus === "green" ? 255 : 0;
        a_output[n_i + 2] = o_settings.s_focus === "blue" ? 255 : 0;
      }
      if (
        o_settings.s_exposure !== "off" &&
        (n_luma <= o_settings.n_under || n_luma >= o_settings.n_over)
      ) {
        const n_value = o_settings.s_exposure === "zebra"
          ? ((n_x + n_y) % 12 < 6 ? 255 : 0)
          : (n_luma <= o_settings.n_under ? 0 : 255);
        a_output[n_i] = a_output[n_i + 1] = a_output[n_i + 2] = n_value;
      }
      if (o_settings.n_motion > 0 && o_settings.b_motion_only && !b_motion) {
        for (let n_c = 0; n_c < 3; n_c++) a_output[n_i + n_c] = a_input[n_raw_i + n_c];
      }
    }
  }
  o_history.a_previous = o_settings.n_motion ? a_input.slice() : null;
  o_history.a_trace = o_settings.n_trace ? a_output.slice() : null;
  return a_output;
}
