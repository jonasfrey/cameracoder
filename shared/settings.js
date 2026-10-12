export const o_defaults = Object.freeze({
  n_brightness: 0,
  n_contrast: 0,
  n_curve: 1,
  n_shadows: 0,
  n_lights: 0,
  s_filter: "none",
  s_exposure: "off",
  n_under: 16,
  n_over: 240,
  s_focus: "off",
  n_focus: 35,
  n_twist: 0,
  n_rgb: 0,
  n_motion: 0,
  n_trace: 0,
  b_motion_only: false,
  b_mirror: false,
  b_bypass: false,
});

export const a_adjustments = [
  { s_key: "n_brightness", s_label: "Brightness", n_min: -100, n_max: 100, n_step: 1 },
  { s_key: "n_contrast", s_label: "Contrast", n_min: -100, n_max: 100, n_step: 1 },
  { s_key: "n_curve", s_label: "Curve · gamma", n_min: 0.2, n_max: 3, n_step: 0.05 },
  { s_key: "n_shadows", s_label: "Shadows", n_min: -100, n_max: 100, n_step: 1 },
  { s_key: "n_lights", s_label: "Highlights", n_min: -100, n_max: 100, n_step: 1 },
];

export function f_normalize_settings(o_input = {}) {
  const o_result = { ...o_defaults };
  const o_ranges = {
    n_brightness: [-100, 100],
    n_contrast: [-100, 100],
    n_curve: [0.2, 3],
    n_shadows: [-100, 100],
    n_lights: [-100, 100],
    n_under: [0, 127],
    n_over: [128, 255],
    n_focus: [1, 255],
    n_twist: [-5, 5],
    n_rgb: [0, 40],
    n_motion: [0, 100],
    n_trace: [0, 0.95],
  };
  const o_choices = {
    s_filter: ["none", "edge", "emboss", "mono", "invert"],
    s_exposure: ["off", "zebra", "solid"],
    s_focus: ["off", "red", "green", "blue"],
  };
  for (const s_key of Object.keys(o_result)) {
    const o_value = o_input?.[s_key];
    if (o_ranges[s_key] && typeof o_value === "number" && Number.isFinite(o_value)) {
      o_result[s_key] = Math.max(o_ranges[s_key][0], Math.min(o_ranges[s_key][1], o_value));
    } else if (o_choices[s_key]?.includes(o_value)) {
      o_result[s_key] = o_value;
    } else if (typeof o_result[s_key] === "boolean" && typeof o_value === "boolean") {
      o_result[s_key] = o_value;
    }
  }
  return o_result;
}
