import {
  computed as f_computed,
  nextTick as f_next_tick,
  onBeforeUnmount as f_on_before_unmount,
  ref as f_ref,
  watch as f_watch,
} from "/vendor/vue.js";
import { a_adjustments, o_defaults } from "/shared/settings.js";

const a_setting_tools = [
  ...a_adjustments.map((o_control, n_index) => ({
    s_id: o_control.s_key,
    s_label: o_control.s_label,
    s_panel: "adjust",
    s_selector: `#${o_control.s_key}`,
    s_icon: ["sun", "contrast", "curve", "sun", "sun"][n_index],
    s_keywords: [
      "light intensity",
      "tonal range",
      "gamma",
      "dark black lift",
      "lights bright white",
    ][n_index],
  })),
  {
    s_id: "s_filter",
    s_label: "Image filter",
    s_panel: "filters",
    s_selector: "#filter-none",
    s_icon: "filter",
    s_keywords:
      "original edges edge detection sobel emboss mono monochrome grayscale negative invert",
  },
  {
    s_id: "n_twist",
    s_label: "Twist",
    s_panel: "filters",
    s_selector: "#twist",
    s_icon: "twist",
    s_keywords: "swirl distortion photo booth",
  },
  {
    s_id: "n_rgb",
    s_label: "RGB offset",
    s_panel: "filters",
    s_selector: "#rgb",
    s_icon: "rgb",
    s_keywords: "color channel shift split chromatic pixels",
  },
  {
    s_id: "s_exposure",
    s_label: "Exposure warning",
    s_panel: "inspect",
    s_selector: "#exposure",
    s_icon: "scope",
    s_keywords: "zebra clipping black white solid overexposed underexposed",
  },
  {
    s_id: "n_under",
    s_label: "Underexposure threshold",
    s_panel: "inspect",
    s_selector: "#under",
    s_icon: "scope",
    s_keywords: "under black dark clipping zebra",
  },
  {
    s_id: "n_over",
    s_label: "Overexposure threshold",
    s_panel: "inspect",
    s_selector: "#over",
    s_icon: "scope",
    s_keywords: "over white highlights clipping zebra",
  },
  {
    s_id: "s_focus",
    s_label: "Focus peaking",
    s_panel: "inspect",
    s_selector: "#focus",
    s_icon: "scope",
    s_keywords: "sharp detail edges red green blue",
  },
  {
    s_id: "n_focus",
    s_label: "Edge threshold",
    s_panel: "inspect",
    s_selector: "#sensitivity",
    s_icon: "scope",
    s_keywords: "focus peaking sensitivity",
  },
  {
    s_id: "n_motion",
    s_label: "Motion threshold",
    s_panel: "motion",
    s_selector: "#motion",
    s_icon: "motion",
    s_keywords: "detect movement green changes sensitivity",
  },
  {
    s_id: "b_motion_only",
    s_label: "Process moving pixels only",
    s_panel: "motion",
    s_selector: "#motion-only",
    s_icon: "motion",
    s_keywords: "apply image tools motion mask static",
  },
  {
    s_id: "n_trace",
    s_label: "Trace persistence",
    s_panel: "motion",
    s_selector: "#trace",
    s_icon: "motion",
    s_keywords: "trail history previous frames blend",
  },
  {
    s_id: "b_mirror",
    s_label: "Mirror preview",
    s_selector: "#mirror-preview",
    s_icon: "mirror",
    s_keywords: "flip horizontal reflection",
  },
  {
    s_id: "b_bypass",
    s_label: "Compare with original",
    s_selector: "#compare-original",
    s_icon: "eye",
    s_keywords: "bypass before after processed image",
  },
];

/** One catalog drives search and removable changes, regardless of where a setting was edited. */
export function f_use_tools(o_api) {
  const o_search_dialog = f_ref(null), o_search_input = f_ref(null);
  const b_search = f_ref(false), s_query = f_ref(""), n_result = f_ref(0);
  const b_fullscreen = f_ref(!!document.fullscreenElement);
  let o_highlight = null, n_highlight_timer = 0;
  const o_labels = {
    none: "Original",
    edge: "Edges",
    emboss: "Emboss",
    mono: "Mono",
    invert: "Negative",
    off: "Off",
    zebra: "Zebra",
    solid: "Black / white",
    red: "Red",
    green: "Green",
    blue: "Blue",
  };
  function f_display(o_value) {
    if (typeof o_value === "boolean") return o_value ? "On" : "Off";
    if (typeof o_value === "number") return String(Number(o_value.toFixed(2)));
    return o_labels[o_value] || String(o_value);
  }
  const a_tools = a_setting_tools.map((o_tool) => ({
    ...o_tool,
    f_value: () =>
      o_tool.s_id === "n_trace"
        ? `${Math.round(o_api.o_settings.n_trace * 100)}%`
        : f_display(o_api.o_settings[o_tool.s_id]),
    f_active: () => o_api.o_settings[o_tool.s_id] !== o_defaults[o_tool.s_id],
    f_reset: () => o_api.o_settings[o_tool.s_id] = o_defaults[o_tool.s_id],
    ...(o_tool.s_id === "b_mirror" || o_tool.s_id === "b_bypass"
      ? {
        s_hint: "Toggle",
        f_run: () => o_api.o_settings[o_tool.s_id] = !o_api.o_settings[o_tool.s_id],
      }
      : {}),
  }));
  function f_add(o_tool) {
    a_tools.push(o_tool);
  }
  for (
    const [s_id, s_label, o_ref, o_default, s_selector, s_keywords] of [
      [
        "capture-size",
        "Capture size",
        o_api.s_resolution,
        "1280x720",
        "#resolution",
        "resolution width height 640 480 1280 720 1920 1080",
      ],
      ["frame-rate", "Frame rate", o_api.n_target_fps, 30, "#framerate", "fps speed 15 30 60"],
      [
        "process-width",
        "Process width",
        o_api.n_process_width,
        960,
        "#quality",
        "quality detail performance fast balanced 480 960 1920",
      ],
    ]
  ) {
    f_add({
      s_id,
      s_label,
      s_panel: "source",
      s_icon: "camera",
      s_selector,
      s_keywords,
      f_value: () => String(o_ref.value),
      f_active: () => o_ref.value !== o_default,
      f_reset: () => {
        if (s_id !== "process-width" && (o_api.b_running.value || o_api.b_starting.value)) {
          o_api.f_stop();
        }
        o_ref.value = o_default;
      },
      f_reset_hint: () =>
        s_id !== "process-width" && (o_api.b_running.value || o_api.b_starting.value)
          ? `Stop camera and reset ${s_label.toLowerCase()} to ${o_default}`
          : `Reset ${s_label.toLowerCase()} to ${o_default}`,
    });
  }
  f_add({
    s_id: "camera-source",
    s_label: "Camera source",
    s_panel: "source",
    s_icon: "camera",
    s_selector: ".camera-option.selected",
    s_keywords: "device usb browser host input select",
    f_value: () =>
      o_api.a_cameras.value.find((o_camera) => o_camera.s_key === o_api.s_selected.value)
        ?.s_label || "Test source",
    f_active: () => o_api.s_source_reset.value !== null,
    f_reset: () => {
      const s_key = o_api.a_cameras.value.some((o_camera) =>
          o_camera.s_key === o_api.s_source_reset.value
        )
        ? o_api.s_source_reset.value
        : "demo";
      o_api.f_select(s_key, false);
      o_api.s_source_reset.value = null;
    },
    f_reset_hint: () => "Stop camera and restore the previous source",
  });
  for (
    const [s_id, s_label, s_icon, o_ref, f_toggle] of [
      [
        "grid",
        "Rule of thirds",
        "grid",
        o_api.b_grid,
        () => o_api.b_grid.value = !o_api.b_grid.value,
      ],
      [
        "freeze",
        "Freeze preview",
        "pause",
        o_api.b_paused,
        () => o_api.b_paused.value = !o_api.b_paused.value,
      ],
      ["fullscreen", "Fullscreen", "expand", b_fullscreen, o_api.f_fullscreen],
    ]
  ) {
    f_add({
      s_id,
      s_label,
      s_icon,
      s_group: "Preview",
      s_hint: "Toggle",
      s_keywords: s_id === "freeze"
        ? "pause resume play"
        : s_id === "grid"
        ? "composition overlay guide"
        : "expand screen exit",
      f_value: () => f_display(o_ref.value),
      f_active: () => o_ref.value,
      f_run: f_toggle,
      f_disabled: () => s_id === "freeze" && !o_api.b_running.value,
      f_reset: () => s_id === "fullscreen" ? o_api.f_fullscreen() : o_ref.value = false,
    });
  }
  f_add({
    s_id: "custom",
    s_label: "Custom function",
    s_panel: "code",
    s_icon: "code",
    s_selector: "#expression-0",
    s_keywords: "expression code shader red green blue rgb",
    f_value: () => o_api.a_custom.value ? "Applied" : "Off",
    f_active: () => !!o_api.a_custom.value,
    f_reset: o_api.f_clear_custom,
  });
  ["Red", "Green", "Blue"].forEach((s_channel, n_index) => {
    const s_identity = ["r", "g", "b"][n_index];
    f_add({
      s_id: `expression-${n_index}`,
      s_label: `${s_channel} expression`,
      s_panel: "code",
      s_icon: "code",
      s_selector: `#expression-${n_index}`,
      s_keywords: "custom function channel code formula",
      f_value: () =>
        `${o_api.a_expressions.value[n_index]}${
          o_api.a_custom.value?.[n_index] === o_api.a_expressions.value[n_index] ? "" : " · draft"
        }`,
      f_active: () =>
        o_api.a_expressions.value[n_index].trim() !== s_identity ||
        (o_api.a_custom.value && o_api.a_custom.value[n_index].trim() !== s_identity),
      f_reset: () => {
        o_api.a_expressions.value[n_index] = s_identity;
        if (o_api.a_custom.value) {
          const a_next = [...o_api.a_custom.value];
          a_next[n_index] = s_identity;
          o_api.a_custom.value = a_next.every((s_value, n_i) =>
              s_value.trim() === ["r", "g", "b"][n_i]
            )
            ? null
            : a_next;
        }
        o_api.s_custom_error.value = "";
      },
    });
  });
  for (const o_filter of o_api.a_filters) {
    f_add({
      s_id: `filter-${o_filter.s_id}`,
      s_label: o_filter.s_label,
      s_icon: "filter",
      s_group: "Filters & effects",
      s_hint: "Apply",
      s_keywords: `image filter ${o_filter.s_id} ${
        o_filter.s_id === "edge"
          ? "edge detection sobel"
          : o_filter.s_id === "mono"
          ? "monochrome grayscale"
          : ""
      }`,
      f_value: () => o_api.o_settings.s_filter === o_filter.s_id ? "Selected" : "",
      f_run: () => o_api.o_settings.s_filter = o_filter.s_id,
    });
  }
  for (
    const [s_id, s_label, s_icon, s_keywords, f_run, f_disabled] of [
      [
        "capture",
        "Capture PNG",
        "camera",
        "save download snapshot photo",
        o_api.f_capture,
        () => !o_api.b_frame.value,
      ],
      [
        "start",
        "Start preview",
        "play",
        "camera play live",
        o_api.f_start,
        () => o_api.b_running.value || o_api.b_starting.value,
      ],
      [
        "stop",
        "Stop camera",
        "stop",
        "release capture disconnect",
        o_api.f_stop,
        () => !o_api.b_running.value && !o_api.b_starting.value,
      ],
      [
        "demo",
        "Explore with a test source",
        "spark",
        "demo generated animation preview",
        o_api.f_demo,
      ],
      [
        "permission",
        "Enable camera access",
        "camera",
        "browser permission allow",
        o_api.f_permission,
        () => o_api.b_permission.value,
      ],
      ["refresh", "Refresh cameras", "refresh", "devices rescan discover", o_api.f_refresh],
      [
        "reset-tone",
        "Reset tone adjustments",
        "sliders",
        "brightness contrast gamma shadows highlights",
        o_api.f_reset_tone,
      ],
      [
        "reset-filters",
        "Reset filters",
        "filter",
        "original twist rgb offset",
        o_api.f_reset_filters,
      ],
      [
        "reset-motion",
        "Reset motion tools",
        "motion",
        "trace persistence moving pixels",
        o_api.f_reset_motion,
      ],
      [
        "apply-custom",
        "Apply custom expressions",
        "code",
        "run function code rgb channels",
        o_api.f_apply_custom,
      ],
      [
        "clear-custom",
        "Clear custom expressions",
        "code",
        "remove function code rgb channels",
        o_api.f_clear_custom,
      ],
      [
        "example",
        "Load example: negative",
        "code",
        "custom function expression preset invert",
        o_api.f_example,
      ],
      [
        "reset-workspace",
        "Reset workspace",
        "refresh",
        "reset all image tools defaults panel layout",
        o_api.f_reset_all,
      ],
    ]
  ) {
    f_add({
      s_id,
      s_label,
      s_icon,
      s_keywords,
      f_run,
      f_disabled,
      s_group: "Actions",
      s_hint: "Run",
    });
  }
  for (const o_panel of o_api.a_panels) {
    f_add({
      s_id: `panel-${o_panel.s_id}`,
      s_label: `${o_panel.s_title} panel`,
      s_icon: o_panel.s_icon,
      s_group: "Panels",
      s_keywords: "show hide open close window tools",
      f_value: () => o_panel.b_open ? "Open" : "Closed",
      s_hint: "Toggle",
      f_run: () => o_api.f_toggle_panel(o_panel),
    });
  }
  const a_commands = f_computed(() =>
    [
      ...a_tools,
      ...o_api.a_cameras.value.map((o_camera) => ({
        s_id: `source-${o_camera.s_key}`,
        s_label: `Select ${o_camera.s_label}`,
        s_icon: "camera",
        s_group: "Camera source",
        s_hint: "Select",
        s_keywords: `device camera ${o_camera.s_kind} ${o_camera.s_id}`,
        f_value: () => o_api.s_selected.value === o_camera.s_key ? "Selected" : "",
        f_run: () => o_api.f_select(o_camera.s_key),
      })),
    ].map((o_tool) => ({
      ...o_tool,
      s_group: o_tool.s_group ||
        o_api.a_panels.find((o_panel) => o_panel.s_id === o_tool.s_panel)?.s_title || "Preview",
      s_hint: o_tool.s_hint || "Adjust",
      s_value: o_tool.f_value?.() || "",
      b_active: !!o_tool.f_active?.(),
      b_disabled: !!o_tool.f_disabled?.(),
      s_reset_hint: o_tool.f_reset_hint?.() || `Reset ${o_tool.s_label.toLowerCase()} to default`,
    }))
  );
  const a_active_tools = f_computed(() =>
    a_commands.value.filter((o_tool) => o_tool.b_active && o_tool.f_reset)
  );
  const a_search_results = f_computed(() => {
    const a_words = s_query.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return a_commands.value.filter((o_tool) =>
      a_words.every((s_word) =>
        `${o_tool.s_label} ${o_tool.s_group} ${o_tool.s_keywords || ""} ${o_tool.s_value}`
          .toLowerCase().includes(s_word)
      )
    ).sort((o_a, o_b) => {
      const s_search = s_query.value.toLowerCase().trim();
      const f_rank = (o_tool) =>
        o_tool.s_label.toLowerCase() === s_search
          ? 2
          : o_tool.s_label.toLowerCase().startsWith(s_search)
          ? 1
          : 0;
      return f_rank(o_b) - f_rank(o_a);
    });
  });
  f_watch(s_query, () => n_result.value = 0, { flush: "sync" });
  f_watch(
    a_search_results,
    (a_results) => n_result.value = Math.min(n_result.value, Math.max(0, a_results.length - 1)),
  );

  async function f_open_search() {
    s_query.value = "";
    n_result.value = 0;
    b_search.value = true;
    o_search_dialog.value.showModal();
    await f_next_tick();
    o_search_input.value.focus();
  }
  function f_close_search() {
    b_search.value = false;
    o_search_dialog.value.close();
  }
  function f_search_tab() {
    const o_target = document.activeElement === o_search_input.value
      ? o_search_dialog.value.querySelector(".search-heading button")
      : o_search_input.value;
    o_target.focus();
  }
  async function f_choose_tool(o_tool) {
    if (!o_tool || o_tool.b_disabled) return;
    f_close_search();
    if (o_tool.f_run) {
      await o_tool.f_run();
      return;
    }
    const o_panel = o_api.a_panels.find((o_item) => o_item.s_id === o_tool.s_panel);
    if (o_panel) {
      if (innerWidth <= 700) o_api.a_panels.forEach((o_item) => o_item.b_open = false);
      o_panel.b_open = true;
      o_api.f_clamp_panel(o_panel);
      o_api.f_raise(o_panel);
    }
    await f_next_tick();
    const o_target = document.querySelector(o_tool.s_selector);
    if (!o_target) return;
    o_highlight?.classList.remove("search-highlight");
    clearTimeout(n_highlight_timer);
    o_highlight = o_target.closest(
      ".slider-field,.field-row,.thresholds,.checkbox-row,.expression-field,.filter-grid,.camera-list",
    ) || o_target;
    o_highlight.classList.add("search-highlight");
    if (o_target.disabled) {
      o_highlight.tabIndex = -1;
      o_highlight.focus();
      o_api.f_notify("Stop the camera before changing capture size or frame rate.");
    } else o_target.focus({ preventScroll: true });
    o_target.scrollIntoView({ block: "nearest" });
    n_highlight_timer = setTimeout(() => o_highlight?.classList.remove("search-highlight"), 2500);
  }
  async function f_search_key(o_event) {
    if (o_event.isComposing) return;
    if (["ArrowDown", "ArrowUp"].includes(o_event.key)) {
      o_event.preventDefault();
      const n_count = a_search_results.value.length;
      if (!n_count) return;
      n_result.value = (n_result.value + (o_event.key === "ArrowDown" ? 1 : -1) + n_count) %
        n_count;
      await f_next_tick();
      document.getElementById(`search-result-${n_result.value}`)?.scrollIntoView({
        block: "nearest",
      });
    } else if (o_event.key === "Enter") {
      o_event.preventDefault();
      await f_choose_tool(a_search_results.value[n_result.value]);
    }
  }
  async function f_remove_tool(o_tool) {
    const n_index = a_active_tools.value.findIndex((o_item) => o_item.s_id === o_tool.s_id);
    await o_tool.f_reset();
    o_api.f_notify(`${o_tool.s_label} reset`);
    await f_next_tick();
    const o_next = a_active_tools.value[Math.min(n_index, a_active_tools.value.length - 1)];
    document.getElementById(o_next ? `active-${o_next.s_id}` : "open-tool-search")?.focus({
      preventScroll: true,
    });
  }
  const f_fullscreen_change = () => b_fullscreen.value = !!document.fullscreenElement;
  document.addEventListener("fullscreenchange", f_fullscreen_change);
  f_on_before_unmount(() => {
    clearTimeout(n_highlight_timer);
    document.removeEventListener("fullscreenchange", f_fullscreen_change);
  });
  return {
    o_search_dialog,
    o_search_input,
    b_search,
    s_query,
    n_result,
    a_search_results,
    a_active_tools,
    f_open_search,
    f_close_search,
    f_choose_tool,
    f_search_key,
    f_search_tab,
    f_remove_tool,
  };
}
