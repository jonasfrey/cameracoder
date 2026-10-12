import {
  computed as f_computed,
  createApp as f_create_app,
  onBeforeUnmount as f_on_before_unmount,
  onMounted as f_on_mounted,
  reactive as f_reactive,
  ref as f_ref,
  watch as f_watch,
} from "/vendor/vue.js";
import { a_adjustments, f_normalize_settings, o_defaults } from "/shared/settings.js";
import { f_compile_custom_glsl } from "/shared/expressions.js";
import { f_use_tools } from "/tool-search.js";

const o_icon = {
  props: ["s_name"],
  template: '<svg class="icon" aria-hidden="true"><use :href="\'#i-\' + s_name"></use></svg>',
};

f_create_app({
  components: { icon: o_icon },
  setup() {
    const o_workspace = f_ref(null), o_preview = f_ref(null);
    let o_saved = {};
    try {
      o_saved = JSON.parse(localStorage.getItem("cameracoder.v1") || "{}");
    } catch { /* Defaults. */ }
    const o_settings = f_reactive(f_normalize_settings(o_saved?.o_settings));
    const a_panels = f_reactive([
      {
        s_id: "source",
        s_title: "Camera source",
        s_short: "Camera",
        s_icon: "camera",
        b_open: innerWidth > 700,
        n_x: 22,
        n_y: 22,
        n_z: 2,
      },
      {
        s_id: "adjust",
        s_title: "Adjustments",
        s_short: "Adjust",
        s_icon: "sliders",
        b_open: innerWidth > 1050,
        n_x: innerWidth - 312,
        n_y: 22,
        n_z: 2,
      },
      {
        s_id: "filters",
        s_title: "Filters & effects",
        s_short: "Filters",
        s_icon: "filter",
        b_open: false,
        n_x: 320,
        n_y: 22,
        n_z: 2,
      },
      {
        s_id: "inspect",
        s_title: "Image inspection",
        s_short: "Inspect",
        s_icon: "scope",
        b_open: false,
        n_x: innerWidth - 330,
        n_y: 100,
        n_z: 2,
      },
      {
        s_id: "motion",
        s_title: "Motion & trace",
        s_short: "Motion",
        s_icon: "motion",
        b_open: false,
        n_x: 335,
        n_y: 85,
        n_z: 2,
      },
      {
        s_id: "code",
        s_title: "Custom function",
        s_short: "Code",
        s_icon: "code",
        b_open: false,
        n_x: 355,
        n_y: 50,
        n_z: 2,
      },
    ]);
    let n_z = 3;
    const a_browser_cameras = f_ref([]), a_host_cameras = f_ref([]), a_warnings = f_ref([]);
    const a_cameras = f_computed(
      () => [...a_browser_cameras.value, ...a_host_cameras.value, {
        s_key: "demo",
        s_id: "demo",
        s_label: "Test source",
        s_kind: "demo",
      }],
    );
    const s_selected = f_ref("demo"), s_resolution = f_ref("1280x720"), n_target_fps = f_ref(30);
    const s_source_reset = f_ref(null);
    const n_process_width = f_ref(960), b_connected = f_ref(false), b_running = f_ref(false);
    const b_starting = f_ref(false),
      b_paused = f_ref(false),
      b_frame = f_ref(false),
      b_grid = f_ref(false);
    const b_permission = f_ref(false), s_error = f_ref(""), s_toast = f_ref("");
    const s_camera_note = f_ref(""), s_source_label = f_ref("");
    const n_width = f_ref(1280), n_height = f_ref(720), n_fps = f_ref(0), n_ms = f_ref(0);
    const a_histogram = f_ref(Array(64).fill(0));
    const n_histogram_max = f_computed(() => Math.max(1, ...a_histogram.value));
    const a_expressions = f_ref(["r", "g", "b"]),
      a_custom = f_ref(null),
      s_custom_error = f_ref("");
    const a_filters = [
      { s_id: "none", s_label: "Original" },
      { s_id: "edge", s_label: "Edges" },
      { s_id: "emboss", s_label: "Emboss" },
      { s_id: "mono", s_label: "Mono" },
      { s_id: "invert", s_label: "Negative" },
    ];
    const s_curve_path = f_computed(() =>
      Array.from(
        { length: 61 },
        (_, n_i) =>
          `${n_i ? "L" : "M"}${n_i * 4},${90 - Math.pow(n_i / 60, 1 / o_settings.n_curve) * 90}`,
      ).join(" ")
    );

    let o_socket = null, o_stream = null, o_worker = null;
    const o_video = document.createElement("video");
    o_video.muted = true;
    o_video.playsInline = true;
    const o_demo = document.createElement("canvas");
    const o_demo_context = o_demo.getContext("2d");
    let s_active_kind = "", n_generation = 0, b_busy = false, b_destroyed = false;
    let n_frame_count = 0, n_counter_start = performance.now(), n_last_frame = 0, n_last_video = -1;
    let n_animation = 0, n_reconnect = 0, n_ping = 0, n_toast = 0, n_watchdog = 0;
    let n_reconnect_delay = 500, n_start_timer = 0;
    const o_abort = new AbortController();
    const o_tools = f_use_tools({
      o_settings,
      a_panels,
      a_cameras,
      a_filters,
      s_selected,
      s_source_reset,
      s_resolution,
      n_target_fps,
      n_process_width,
      b_running,
      b_starting,
      b_frame,
      b_grid,
      b_paused,
      b_permission,
      a_expressions,
      a_custom,
      s_custom_error,
      f_select,
      f_stop,
      f_start,
      f_demo,
      f_capture,
      f_permission,
      f_refresh,
      f_fullscreen,
      f_apply_custom,
      f_clear_custom,
      f_example,
      f_reset_tone,
      f_reset_filters,
      f_reset_motion,
      f_reset_all,
      f_toggle_panel,
      f_clamp_panel,
      f_raise,
      f_notify,
    });
    function f_notify(s_message) {
      s_toast.value = s_message;
      clearTimeout(n_toast);
      n_toast = setTimeout(() => s_toast.value = "", 2800);
    }
    function f_send(o_message) {
      if (o_socket?.readyState === WebSocket.OPEN) {
        o_socket.send(JSON.stringify(o_message));
        return true;
      }
      return false;
    }
    function f_connect() {
      if (b_destroyed) return;
      o_socket = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`,
      );
      o_socket.binaryType = "blob";
      o_socket.onopen = () => {
        b_connected.value = true;
        n_reconnect_delay = 500;
        f_send({ s_type: "camera.list" });
        clearInterval(n_ping);
        n_ping = setInterval(() => f_send({ s_type: "ping" }), 20000);
      };
      o_socket.onmessage = async (o_event) => {
        if (typeof o_event.data !== "string") {
          if (s_active_kind !== "host" || !b_running.value || b_paused.value || b_busy) return;
          await f_submit(o_event.data);
          return;
        }
        let o_message;
        try {
          o_message = JSON.parse(o_event.data);
        } catch {
          return;
        }
        if (o_message.n_request !== undefined && o_message.n_request !== n_generation) return;
        if (o_message.s_type === "camera.list") {
          a_host_cameras.value = o_message.a_cameras.map((o_camera) => ({
            ...o_camera,
            s_key: `host:${o_camera.s_id}`,
          }));
          a_warnings.value = o_message.a_warnings || [];
          if (
            !b_running.value && !b_starting.value && s_selected.value === "demo" &&
            a_host_cameras.value.length && !a_browser_cameras.value.length
          ) {
            s_selected.value = a_host_cameras.value[0].s_key;
          }
        } else if (
          o_message.s_type === "camera.started" && s_active_kind === "host" &&
          s_selected.value === `host:${o_message.s_id}`
        ) {
          b_starting.value = false;
          b_running.value = true;
          clearTimeout(n_start_timer);
        } else if (o_message.s_type === "error") {
          s_error.value = o_message.s_message;
          if (s_active_kind === "host") f_stop();
        }
      };
      o_socket.onerror = () => {}; // Close handles reconnection and active capture cleanup.
      o_socket.onclose = () => {
        b_connected.value = false;
        clearInterval(n_ping);
        if (s_active_kind === "host") {
          f_stop();
          s_error.value = "Server disconnected. Reconnect, then start the camera again.";
        }
        if (!b_destroyed) {
          n_reconnect = setTimeout(f_connect, n_reconnect_delay);
          n_reconnect_delay = Math.min(10000, n_reconnect_delay * 2);
        }
      };
    }
    async function f_enumerate() {
      if (!navigator.mediaDevices?.enumerateDevices) {
        s_camera_note.value = "Browser cameras need localhost or HTTPS.";
        return;
      }
      try {
        const a_devices = await navigator.mediaDevices.enumerateDevices();
        a_browser_cameras.value = a_devices.filter((o_device) => o_device.kind === "videoinput")
          .map((o_device, n_index) => ({
            s_id: o_device.deviceId,
            s_key: `browser:${o_device.deviceId || n_index}`,
            s_label: o_device.label || `Camera ${n_index + 1}`,
            s_kind: "browser",
          }));
        s_camera_note.value = a_browser_cameras.value.length
          ? ""
          : "No browser cameras found. Connect a camera and refresh.";
        if (
          !b_running.value && !b_starting.value && s_selected.value === "demo" &&
          a_browser_cameras.value.length
        ) {
          s_selected.value = a_browser_cameras.value[0].s_key;
        }
        if (
          !b_running.value && !b_starting.value &&
          !a_cameras.value.some((o_camera) => o_camera.s_key === s_selected.value)
        ) {
          s_selected.value = a_cameras.value[0]?.s_key || "demo";
        }
      } catch (o_error) {
        s_camera_note.value = o_error.message;
      }
    }
    async function f_refresh() {
      await f_enumerate();
      f_send({ s_type: "camera.list" });
    }
    function f_camera_error(o_error) {
      const o_messages = {
        NotAllowedError:
          "Camera permission denied. Allow camera access in your browser and try again.",
        NotFoundError: "No camera found. Connect a camera or try the test source.",
        NotReadableError: "Camera is busy or unavailable. Close other camera apps and try again.",
        OverconstrainedError: "Camera settings are unsupported. Try a smaller capture size.",
        SecurityError: "Use localhost or HTTPS for camera access.",
      };
      return o_messages[o_error.name] || o_error.message || "Could not open the camera.";
    }
    async function f_permission() {
      if (!navigator.mediaDevices?.getUserMedia) {
        s_error.value = "Browser cameras need localhost or HTTPS.";
        return;
      }
      b_permission.value = true;
      s_error.value = "";
      try {
        if (!o_stream) {
          const o_permission_stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          o_permission_stream.getTracks().forEach((o_track) => o_track.stop());
        }
        await f_enumerate();
      } catch (o_error) {
        s_error.value = f_camera_error(o_error);
      } finally {
        b_permission.value = false;
      }
    }
    function f_stop() {
      n_generation++;
      clearTimeout(n_start_timer);
      if (s_active_kind === "host") f_send({ s_type: "camera.stop", n_request: n_generation });
      s_active_kind = "";
      b_running.value = false;
      b_starting.value = false;
      b_paused.value = false;
      o_stream?.getTracks().forEach((o_track) => {
        o_track.onended = null;
        o_track.stop();
      });
      o_stream = null;
      o_video.pause();
      o_video.srcObject = null;
      n_fps.value = 0;
      n_frame_count = 0;
    }
    async function f_select(s_key, b_remember = true) {
      if (s_selected.value === s_key) return;
      if (b_remember && s_source_reset.value === null) s_source_reset.value = s_selected.value;
      f_stop();
      s_selected.value = s_key;
      if (s_selected.value === s_source_reset.value) s_source_reset.value = null;
    }
    async function f_start() {
      f_stop();
      s_error.value = "";
      if (!o_worker) {
        s_error.value = "Image tools require WebGL2, Web Workers, and OffscreenCanvas.";
        return;
      }
      const o_camera = a_cameras.value.find((o_item) => o_item.s_key === s_selected.value);
      if (!o_camera) {
        s_error.value = "Select an available camera.";
        return;
      }
      const n_token = n_generation;
      const [n_capture_width, n_capture_height] = s_resolution.value.split("x").map(Number);
      s_active_kind = o_camera.s_kind;
      s_source_label.value = o_camera.s_label;
      b_starting.value = true;
      n_counter_start = performance.now();
      n_last_video = -1;
      try {
        if (o_camera.s_kind === "browser") {
          if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Browser cameras need localhost or HTTPS.");
          }
          const o_next = await navigator.mediaDevices.getUserMedia({
            video: {
              ...(o_camera.s_id ? { deviceId: { exact: o_camera.s_id } } : {}),
              width: { ideal: n_capture_width },
              height: { ideal: n_capture_height },
              frameRate: { ideal: n_target_fps.value },
            },
            audio: false,
          });
          if (n_token !== n_generation || b_destroyed) {
            o_next.getTracks().forEach((o_track) => o_track.stop());
            return;
          }
          o_stream = o_next;
          o_video.srcObject = o_next;
          await o_video.play();
          if (n_token !== n_generation) return;
          o_next.getVideoTracks()[0].onended = () => {
            f_stop();
            s_error.value = "Camera disconnected. Reconnect it and refresh the camera list.";
            f_refresh();
          };
          s_source_label.value = o_next.getVideoTracks()[0].label || o_camera.s_label;
          const s_device = o_next.getVideoTracks()[0].getSettings().deviceId;
          if (s_device) s_selected.value = `browser:${s_device}`;
          b_running.value = true;
          b_starting.value = false;
          await f_enumerate();
        } else if (o_camera.s_kind === "host") {
          if (
            !f_send({
              s_type: "camera.start",
              s_id: o_camera.s_id,
              n_width: n_capture_width,
              n_height: n_capture_height,
              n_fps: n_target_fps.value,
              n_request: n_token,
            })
          ) throw new Error("Wait for the server to reconnect.");
          n_start_timer = setTimeout(() => {
            if (b_starting.value) {
              f_stop();
              s_error.value = "Camera timed out. Refresh cameras and try again.";
            }
          }, 15000);
        } else {
          o_demo.width = n_capture_width;
          o_demo.height = n_capture_height;
          b_running.value = true;
          b_starting.value = false;
        }
        if (innerWidth <= 700) a_panels.forEach((o_panel) => o_panel.b_open = false);
      } catch (o_error) {
        if (n_token === n_generation) {
          f_stop();
          s_error.value = f_camera_error(o_error);
        }
      }
    }
    function f_demo() {
      f_select("demo");
      f_start();
    }
    function f_draw_demo(n_time) {
      const o_ctx = o_demo_context, n_w = o_demo.width, n_h = o_demo.height;
      o_ctx.fillStyle = "#101e27";
      o_ctx.fillRect(0, 0, n_w, n_h);
      const o_gradient = o_ctx.createLinearGradient(0, 0, n_w, n_h);
      o_gradient.addColorStop(0, "#4b898e");
      o_gradient.addColorStop(.5, "#1f4659");
      o_gradient.addColorStop(1, "#2a2746");
      o_ctx.fillStyle = o_gradient;
      o_ctx.fillRect(0, 0, n_w, n_h);
      o_ctx.strokeStyle = "#ffffff0d";
      o_ctx.lineWidth = 1;
      for (let n_x = 0; n_x < n_w; n_x += n_w / 24) {
        o_ctx.beginPath();
        o_ctx.moveTo(n_x, 0);
        o_ctx.lineTo(n_x, n_h);
        o_ctx.stroke();
      }
      for (let n_y = 0; n_y < n_h; n_y += n_w / 24) {
        o_ctx.beginPath();
        o_ctx.moveTo(0, n_y);
        o_ctx.lineTo(n_w, n_y);
        o_ctx.stroke();
      }
      const n_r = n_h * .28, n_x = n_w * .5 + Math.sin(n_time * .6) * n_w * .14, n_y = n_h * .46;
      const o_sphere = o_ctx.createRadialGradient(
        n_x - n_r * .4,
        n_y - n_r * .4,
        n_r * .05,
        n_x,
        n_y,
        n_r,
      );
      o_sphere.addColorStop(0, "#fff7d1");
      o_sphere.addColorStop(.3, "#d9bb85");
      o_sphere.addColorStop(.65, "#b78067");
      o_sphere.addColorStop(1, "#493548");
      o_ctx.save();
      o_ctx.shadowColor = "#050c1980";
      o_ctx.shadowBlur = n_r / 3;
      o_ctx.shadowOffsetY = n_r / 6;
      o_ctx.fillStyle = o_sphere;
      o_ctx.beginPath();
      o_ctx.arc(n_x, n_y, n_r, 0, Math.PI * 2);
      o_ctx.fill();
      o_ctx.restore();
      o_ctx.strokeStyle = "#bdeed391";
      o_ctx.lineWidth = 1;
      o_ctx.beginPath();
      o_ctx.ellipse(n_w / 2, n_y, n_w * .28, n_h * .14, -.35, 0, Math.PI * 2);
      o_ctx.stroke();
      o_ctx.fillStyle = "#a7efd0";
      o_ctx.beginPath();
      o_ctx.arc(
        n_w / 2 + Math.cos(n_time) * n_w * .24,
        n_y + Math.sin(n_time) * n_h * .14,
        n_h * .025,
        0,
        Math.PI * 2,
      );
      o_ctx.fill();
      const a_colors = [
        "#eef1e8",
        "#e7d58d",
        "#8bccc8",
        "#9cba83",
        "#a28ab8",
        "#ca8b7e",
        "#66809d",
        "#121719",
      ];
      a_colors.forEach((s_color, n_i) => {
        o_ctx.fillStyle = s_color;
        o_ctx.fillRect(n_w * .32 + n_i * n_w * .045, n_h * .83, n_w * .043, n_h * .055);
      });
      o_ctx.fillStyle = "#d7ece4";
      o_ctx.font = `${n_h * .014}px monospace`;
      o_ctx.fillText("CAMERACODER / TEST SIGNAL", n_w * .045, n_h * .065);
      o_ctx.fillStyle = "#a1c4c7";
      o_ctx.fillText("COLOR · DETAIL · MOTION", n_w * .045, n_h * .94);
    }
    function f_worker_start() {
      if (!window.OffscreenCanvas || !window.Worker) return;
      o_worker = new Worker("/worker.js", { type: "module" });
      o_worker.onmessage = (o_event) => {
        b_busy = false;
        clearTimeout(n_watchdog);
        const o_data = o_event.data;
        if (o_data.n_generation !== n_generation) {
          o_data.o_bitmap?.close();
          return;
        }
        if (o_data.s_error) {
          f_stop();
          s_error.value = `Image processing: ${o_data.s_error}`;
          return;
        }
        const o_canvas = o_preview.value;
        if (!o_canvas || b_paused.value) {
          o_data.o_bitmap?.close();
          return;
        }
        if (o_canvas.width !== o_data.n_width || o_canvas.height !== o_data.n_height) {
          o_canvas.width = o_data.n_width;
          o_canvas.height = o_data.n_height;
        }
        try {
          const o_context = o_canvas.getContext("bitmaprenderer");
          if (!o_context) throw new Error("This browser cannot display processed ImageBitmaps.");
          o_context.transferFromImageBitmap(o_data.o_bitmap);
        } catch (o_error) {
          f_stop();
          s_error.value = `Image display: ${o_error.message}`;
          return;
        } finally {
          o_data.o_bitmap.close();
        }
        n_width.value = o_data.n_width;
        n_height.value = o_data.n_height;
        n_ms.value = Math.round(o_data.n_ms);
        a_histogram.value = o_data.a_histogram;
        b_frame.value = true;
        n_frame_count++;
      };
      o_worker.onerror = (o_event) => {
        o_event.preventDefault();
        clearTimeout(n_watchdog);
        b_busy = false;
        f_stop();
        s_error.value = "Image worker failed. Reload the page to try again.";
        o_worker.terminate();
        o_worker = null;
      };
    }
    async function f_submit(o_source) {
      if (b_busy || !o_worker) return;
      b_busy = true;
      const n_token = n_generation;
      let o_bitmap = null;
      try {
        o_bitmap = await createImageBitmap(o_source);
        if (n_token !== n_generation || !b_running.value) {
          o_bitmap.close();
          b_busy = false;
          return;
        }
        const n_scaled_width = Math.min(n_process_width.value, o_bitmap.width);
        const n_scaled_height = Math.max(
          1,
          Math.round(o_bitmap.height * n_scaled_width / o_bitmap.width),
        );
        const o_plain_settings = f_normalize_settings(o_settings);
        o_worker.postMessage({
          o_bitmap,
          n_width: n_scaled_width,
          n_height: n_scaled_height,
          o_settings: o_plain_settings,
          a_custom: a_custom.value ? [...a_custom.value] : null,
          n_time: performance.now() / 1000,
          n_generation: n_token,
        }, [o_bitmap]);
        n_watchdog = setTimeout(() => {
          o_worker?.terminate();
          o_worker = null;
          b_busy = false;
          f_stop();
          f_worker_start();
          s_error.value =
            "Image processing timed out. Reduce the process width or simplify custom expressions.";
        }, 5000);
      } catch (o_error) {
        o_bitmap?.close();
        b_busy = false;
        if (n_token === n_generation) {
          f_stop();
          s_error.value = `Could not process image: ${o_error.message}`;
        }
      }
    }
    function f_tick(n_time) {
      n_animation = requestAnimationFrame(f_tick);
      if (n_time - n_counter_start >= 1000) {
        n_fps.value = Math.round(n_frame_count * 1000 / (n_time - n_counter_start));
        n_frame_count = 0;
        n_counter_start = n_time;
      }
      if (
        !b_running.value || b_paused.value || b_busy ||
        n_time - n_last_frame < 1000 / n_target_fps.value
      ) return;
      if (s_active_kind === "demo") {
        f_draw_demo(n_time / 1000);
        f_submit(o_demo);
        n_last_frame = n_time;
      } else if (
        s_active_kind === "browser" && o_video.readyState >= 2 &&
        o_video.currentTime !== n_last_video
      ) {
        n_last_video = o_video.currentTime;
        n_last_frame = n_time;
        f_submit(o_video);
      }
    }
    function f_capture() {
      if (!b_frame.value) return;
      o_preview.value.toBlob((o_blob) => {
        if (!o_blob) {
          s_error.value = "Capture failed.";
          return;
        }
        const s_url = URL.createObjectURL(o_blob), o_link = document.createElement("a");
        o_link.href = s_url;
        o_link.download = `cameracoder-${new Date().toISOString().replaceAll(":", "-")}.png`;
        o_link.click();
        setTimeout(() => URL.revokeObjectURL(s_url), 10000);
        f_notify("PNG captured");
      }, "image/png");
    }
    async function f_fullscreen() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.getElementById("app").requestFullscreen();
      } catch {
        s_error.value = "Fullscreen is unavailable in this browser.";
      }
    }
    function f_apply_custom() {
      try {
        f_compile_custom_glsl(a_expressions.value);
        a_custom.value = [...a_expressions.value];
        s_custom_error.value = "";
      } catch (o_error) {
        s_custom_error.value = o_error.message;
        const o_panel = a_panels.find((o_item) => o_item.s_id === "code");
        if (!o_panel.b_open) f_toggle_panel(o_panel);
      }
    }
    function f_example() {
      a_expressions.value = ["255 - r", "255 - g", "255 - b"];
      const o_panel = a_panels.find((o_item) => o_item.s_id === "code");
      if (!o_panel.b_open) f_toggle_panel(o_panel);
    }
    function f_clear_custom() {
      a_custom.value = null;
      a_expressions.value = ["r", "g", "b"];
      s_custom_error.value = "";
    }
    function f_value(n_value) {
      return Number(n_value.toFixed(2));
    }
    function f_reset_tone() {
      a_adjustments.forEach((o_control) =>
        o_settings[o_control.s_key] = o_defaults[o_control.s_key]
      );
    }
    function f_reset_filters() {
      for (const s_key of ["s_filter", "n_twist", "n_rgb"]) o_settings[s_key] = o_defaults[s_key];
    }
    function f_reset_motion() {
      for (const s_key of ["n_motion", "n_trace", "b_motion_only"]) {
        o_settings[s_key] = o_defaults[s_key];
      }
    }
    function f_raise(o_panel) {
      o_panel.n_z = ++n_z;
    }
    function f_clamp_panel(o_panel) {
      const n_panel_width = innerWidth <= 700
        ? Math.min(320, innerWidth - 28)
        : innerWidth >= 1450
        ? 290
        : innerWidth <= 1050
        ? 255
        : 278;
      o_panel.n_x = Math.max(
        10,
        Math.min(o_panel.n_x, (o_workspace.value?.clientWidth || innerWidth) - n_panel_width - 10),
      );
      o_panel.n_y = Math.max(
        10,
        Math.min(o_panel.n_y, (o_workspace.value?.clientHeight || innerHeight - 146) - 145),
      );
    }
    function f_panel_style(o_panel) {
      return {
        left: `${o_panel.n_x}px`,
        top: `${o_panel.n_y}px`,
        zIndex: o_panel.n_z,
        maxHeight: `calc(100% - ${o_panel.n_y + 65}px)`,
      };
    }
    function f_toggle_panel(o_panel) {
      const b_open = !o_panel.b_open;
      if (innerWidth <= 700) a_panels.forEach((o_item) => o_item.b_open = false);
      o_panel.b_open = b_open;
      f_clamp_panel(o_panel);
      f_raise(o_panel);
    }
    function f_drag(o_event, o_panel) {
      if (o_event.button !== 0) return;
      o_event.preventDefault();
      const o_header = o_event.currentTarget;
      const n_start_x = o_event.clientX - o_panel.n_x, n_start_y = o_event.clientY - o_panel.n_y;
      o_header.setPointerCapture(o_event.pointerId);
      function f_move(o_move) {
        o_panel.n_x = o_move.clientX - n_start_x;
        o_panel.n_y = o_move.clientY - n_start_y;
        f_clamp_panel(o_panel);
      }
      function f_end() {
        o_header.removeEventListener("pointermove", f_move);
        o_header.removeEventListener("pointerup", f_end);
        o_header.removeEventListener("pointercancel", f_end);
      }
      o_header.addEventListener("pointermove", f_move);
      o_header.addEventListener("pointerup", f_end);
      o_header.addEventListener("pointercancel", f_end);
    }
    function f_move_key(o_event, o_panel) {
      const o_keys = {
        ArrowLeft: [-10, 0],
        ArrowRight: [10, 0],
        ArrowUp: [0, -10],
        ArrowDown: [0, 10],
      };
      if (!o_keys[o_event.key]) return;
      o_event.preventDefault();
      o_panel.n_x += o_keys[o_event.key][0];
      o_panel.n_y += o_keys[o_event.key][1];
      f_clamp_panel(o_panel);
    }
    function f_reset_all() {
      Object.assign(o_settings, o_defaults);
      f_clear_custom();
      a_panels.forEach((o_panel, n_index) => {
        o_panel.b_open = innerWidth > 1050 ? n_index < 2 : innerWidth > 700 && n_index === 0;
        o_panel.n_x = n_index === 1 ? innerWidth - 312 : 22 + Math.max(0, n_index - 1) * 20;
        o_panel.n_y = 22;
        f_clamp_panel(o_panel);
      });
      b_grid.value = false;
      f_notify("Workspace reset");
    }
    function f_key(o_event) {
      if (
        (o_event.ctrlKey || o_event.metaKey) && o_event.shiftKey && !o_event.altKey &&
        o_event.code === "KeyP"
      ) {
        o_event.preventDefault();
        if (!o_event.repeat) o_tools.f_open_search();
        return;
      }
      if (o_tools.b_search.value) return;
      if (
        o_event.ctrlKey || o_event.metaKey || o_event.altKey ||
        o_event.target.closest("input,textarea,select,button,a")
      ) return;
      if (o_event.code === "Space" && b_running.value) {
        o_event.preventDefault();
        b_paused.value = !b_paused.value;
      }
      if (o_event.key.toLowerCase() === "s") f_capture();
      if (o_event.key.toLowerCase() === "g") b_grid.value = !b_grid.value;
      if (o_event.key.toLowerCase() === "b") o_settings.b_bypass = !o_settings.b_bypass;
      if (o_event.key === "Escape") a_panels.forEach((o_panel) => o_panel.b_open = false);
    }
    f_watch(o_settings, () => {
      try {
        localStorage.setItem(
          "cameracoder.v1",
          JSON.stringify({ o_settings: f_normalize_settings(o_settings) }),
        );
      } catch { /* Storage may be disabled. */ }
    });
    f_on_mounted(() => {
      f_worker_start();
      f_connect();
      f_enumerate();
      a_panels.forEach(f_clamp_panel);
      n_animation = requestAnimationFrame(f_tick);
      window.addEventListener("keydown", f_key, { signal: o_abort.signal });
      window.addEventListener("resize", () => a_panels.forEach(f_clamp_panel), {
        signal: o_abort.signal,
      });
      navigator.mediaDevices?.addEventListener("devicechange", f_refresh, {
        signal: o_abort.signal,
      });
      window.addEventListener("pagehide", () => {
        b_destroyed = true;
        f_stop();
        o_socket?.close();
        o_worker?.terminate();
        clearTimeout(n_reconnect);
        clearTimeout(n_watchdog);
        clearInterval(n_ping);
        cancelAnimationFrame(n_animation);
      }, { signal: o_abort.signal });
    });
    f_on_before_unmount(() => {
      b_destroyed = true;
      f_stop();
      o_socket?.close();
      o_worker?.terminate();
      o_abort.abort();
      clearTimeout(n_reconnect);
      clearTimeout(n_toast);
      clearTimeout(n_watchdog);
      clearInterval(n_ping);
      cancelAnimationFrame(n_animation);
    });
    return {
      ...o_tools,
      o_workspace,
      o_preview,
      o_settings,
      o_defaults,
      a_panels,
      a_adjustments,
      a_cameras,
      a_warnings,
      s_selected,
      s_resolution,
      n_target_fps,
      n_process_width,
      b_connected,
      b_running,
      b_starting,
      b_paused,
      b_frame,
      b_grid,
      b_permission,
      s_error,
      s_toast,
      s_camera_note,
      s_source_label,
      n_width,
      n_height,
      n_fps,
      n_ms,
      a_histogram,
      n_histogram_max,
      a_expressions,
      a_custom,
      s_custom_error,
      a_filters,
      s_curve_path,
      f_refresh,
      f_permission,
      f_select,
      f_start,
      f_stop,
      f_demo,
      f_capture,
      f_fullscreen,
      f_apply_custom,
      f_clear_custom,
      f_example,
      f_reset_filters,
      f_reset_motion,
      f_value,
      f_reset_tone,
      f_raise,
      f_panel_style,
      f_toggle_panel,
      f_drag,
      f_move_key,
      f_reset_all,
    };
  },
}).mount("#app");
