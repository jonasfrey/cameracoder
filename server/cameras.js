export function f_parse_devices(s_output) {
  const a_devices = [];
  let s_label = "USB camera";
  for (const s_line of s_output.split("\n")) {
    if (/^\S.*:\s*$/.test(s_line)) s_label = s_line.trim().replace(/:\s*$/, "");
    const a_match = s_line.match(/^\s+(\/dev\/video\d+)\s*$/);
    if (a_match && !a_devices.some((o_device) => o_device.s_id === a_match[1])) {
      a_devices.push({ s_id: a_match[1], s_label, s_kind: "host" });
    }
  }
  return a_devices;
}

/** Discover with V4L2: Deno protects /dev and /sys even with scoped read access. */
export async function f_list_cameras() {
  const a_cameras = [];
  const a_warnings = [];
  if (Deno.build.os !== "linux") {
    return { a_cameras, a_warnings: ["Host capture requires Linux. Use browser cameras."] };
  }
  let a_devices;
  try {
    const o_output = await new Deno.Command("v4l2-ctl", {
      args: ["--list-devices"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    a_devices = f_parse_devices(new TextDecoder().decode(o_output.stdout));
  } catch {
    return { a_cameras, a_warnings: ["Install v4l-utils to discover host cameras."] };
  }
  for (const o_device of a_devices) {
    try {
      const o_output = await new Deno.Command("v4l2-ctl", {
        args: ["--device", o_device.s_id, "--list-formats-ext"],
        stdout: "piped",
        stderr: "piped",
      }).output();
      const s_formats = new TextDecoder().decode(o_output.stdout);
      if (o_output.success && !/\[\d+\]:/.test(s_formats)) continue; // Metadata-only node.
    } catch { /* Keep the device selectable; capture reports device errors. */ }
    a_cameras.push(o_device);
  }
  return { a_cameras, a_warnings };
}

export function f_capture_options(o_input) {
  const a_sizes = [[640, 480], [1280, 720], [1920, 1080]];
  if (!a_sizes.some(([n_w, n_h]) => n_w === o_input.n_width && n_h === o_input.n_height)) {
    throw new Error("Choose a supported capture size.");
  }
  if (![15, 30, 60].includes(o_input.n_fps)) throw new Error("Invalid frame rate.");
  return { n_width: o_input.n_width, n_height: o_input.n_height, n_fps: o_input.n_fps };
}

/** Incremental JPEG framing, including markers split across stdout chunks. */
export class O_jpeg_parser {
  a_pending = new Uint8Array();
  f_push(a_chunk) {
    const a_data = new Uint8Array(this.a_pending.length + a_chunk.length);
    a_data.set(this.a_pending);
    a_data.set(a_chunk, this.a_pending.length);
    const a_frames = [];
    let n_start = -1;
    let n_consumed = 0;
    for (let n_i = 0; n_i < a_data.length - 1; n_i++) {
      if (n_start < 0 && a_data[n_i] === 255 && a_data[n_i + 1] === 216) n_start = n_i++;
      else if (n_start >= 0 && a_data[n_i] === 255 && a_data[n_i + 1] === 217) {
        a_frames.push(a_data.slice(n_start, n_i + 2));
        n_consumed = n_i + 2;
        n_start = -1;
        n_i++;
      }
    }
    this.a_pending = a_data.slice(n_start >= 0 ? n_start : Math.max(n_consumed, a_data.length - 1));
    if (this.a_pending.length > 16 * 1024 * 1024) throw new Error("Camera frame too large.");
    return a_frames;
  }
}

export class O_capture {
  o_process = null;
  o_done = null;
  b_stopped = false;

  f_start(a_input_args, o_options, f_frame, f_error) {
    this.o_process = new Deno.Command("ffmpeg", {
      args: [
        "-hide_banner",
        "-loglevel",
        "error",
        ...a_input_args,
        "-an",
        "-vf",
        `fps=${o_options.n_fps},scale=${o_options.n_width}:${o_options.n_height}:force_original_aspect_ratio=decrease`,
        "-c:v",
        "mjpeg",
        "-q:v",
        "4",
        "-threads",
        "1",
        "-f",
        "image2pipe",
        "pipe:1",
      ],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const o_process = this.o_process;
    let s_error = "";
    let b_received = false;
    const n_timeout = setTimeout(() => {
      if (!b_received && !this.b_stopped) {
        f_error("Camera timed out. Try another resolution or close other camera apps.");
        this.f_stop();
      }
    }, 10000);
    const o_parser = new O_jpeg_parser();
    this.o_done = (async () => {
      try {
        const a_results = await Promise.allSettled([
          (async () => {
            for await (const a_chunk of o_process.stdout) {
              for (const a_frame of o_parser.f_push(a_chunk)) {
                if (this.b_stopped) continue;
                b_received = true;
                clearTimeout(n_timeout);
                f_frame(a_frame);
              }
            }
          })(),
          (async () => {
            const o_decoder = new TextDecoder();
            for await (const a_chunk of o_process.stderr) {
              s_error = (s_error + o_decoder.decode(a_chunk)).slice(-2000);
            }
          })(),
          o_process.status,
        ]);
        if (!this.b_stopped) {
          const o_failed = a_results.find((o_result) => o_result.status === "rejected");
          f_error(s_error.trim() || (o_failed ? "Camera stream failed." : "Camera stream ended."));
        }
      } finally {
        clearTimeout(n_timeout);
      }
    })();
  }

  async f_stop() {
    this.b_stopped = true;
    if (!this.o_process) return;
    try {
      this.o_process.kill("SIGTERM");
    } catch { /* Already exited. */ }
    const n_timer = setTimeout(() => {
      try {
        this.o_process.kill("SIGKILL");
      } catch { /* Already exited. */ }
    }, 1000);
    await this.o_done;
    clearTimeout(n_timer);
  }
}
