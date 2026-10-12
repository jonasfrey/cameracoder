import { f_handler } from "../server.js";
import { f_capture_options, f_parse_devices, O_capture, O_jpeg_parser } from "../server/cameras.js";

function f_assert(b_value, s_message = "Assertion failed") {
  if (!b_value) throw new Error(s_message);
}

Deno.test("V4L2 discovery parses every video node and ignores non-video paths", () => {
  const a_devices = f_parse_devices(
    "USB Camera (usb-0000:01):\n\t/dev/video0\n\t/dev/video1\n\t/dev/media0\n\nOther Camera:\n\t/dev/video2\n\t/etc/passwd\n\t/dev/video2\n",
  );
  f_assert(a_devices.length === 3);
  f_assert(a_devices[0].s_label === "USB Camera (usb-0000:01)");
  f_assert(a_devices[2].s_id === "/dev/video2" && a_devices[2].s_label === "Other Camera");
});

Deno.test("static routes, HEAD, health, and rejected file traversal", async () => {
  const f_serve = f_handler();
  const o_home = await f_serve(new Request("http://localhost/"));
  f_assert(o_home.status === 200 && (await o_home.text()).includes("CameraCoder"));
  f_assert(o_home.headers.get("content-security-policy").includes("frame-ancestors 'none'"));
  const o_head = await f_serve(new Request("http://localhost/app.js", { method: "HEAD" }));
  f_assert(o_head.status === 200 && (await o_head.text()) === "");
  const o_health = await f_serve(new Request("http://localhost/health"));
  f_assert((await o_health.json()).s_status === "ok");
  for (const s_path of ["/.git/config", "/docs/requirements.md", "/server.js", "/unknown"]) {
    const o_result = await f_serve(new Request(`http://localhost${s_path}`));
    f_assert(o_result.status === 404);
    await o_result.body?.cancel();
  }
  const o_post = await f_serve(new Request("http://localhost/", { method: "POST" }));
  f_assert(o_post.status === 405);
  await o_post.body?.cancel();
});
Deno.test("WebSocket origin and DNS rebinding protection", async () => {
  const f_serve = f_handler();
  for (
    const o_request of [
      new Request("http://localhost/ws", {
        headers: { origin: "https://attacker.example", upgrade: "websocket" },
      }),
      new Request("http://localhost/ws", { headers: { upgrade: "websocket" } }),
      new Request("http://attacker.example/"),
    ]
  ) {
    const o_response = await f_serve(o_request);
    f_assert(o_response.status === 403);
    await o_response.body?.cancel();
  }
  const o_response = await f_serve(
    new Request("http://localhost/ws", { headers: { origin: "http://localhost" } }),
  );
  f_assert(o_response.status === 426);
  await o_response.body?.cancel();
});
Deno.test("capture options reject unexpected executable arguments", () => {
  f_assert(f_capture_options({ n_width: 1280, n_height: 720, n_fps: 30 }).n_fps === 30);
  for (
    const o_options of [{ n_width: "1280;id", n_height: 720, n_fps: 30 }, {
      n_width: 640,
      n_height: 480,
      n_fps: 999,
    }]
  ) {
    let b_failed = false;
    try {
      f_capture_options(o_options);
    } catch {
      b_failed = true;
    }
    f_assert(b_failed);
  }
});
Deno.test("JPEG framing handles partial markers, noise, and multiple frames", () => {
  const a_input = new Uint8Array([9, 255, 216, 1, 2, 255, 217, 255, 216, 3, 255, 217]);
  for (const n_chunk of [1, 2, 3, 7, 20]) {
    const o_parser = new O_jpeg_parser(), a_frames = [];
    for (let n_i = 0; n_i < a_input.length; n_i += n_chunk) {
      a_frames.push(...o_parser.f_push(a_input.slice(n_i, n_i + n_chunk)));
    }
    f_assert(a_frames.length === 2);
    f_assert(a_frames[0].join(",") === "255,216,1,2,255,217");
    f_assert(a_frames[1].join(",") === "255,216,3,255,217");
  }
});
Deno.test("FFmpeg streams real JPEG frames and stops the process", async () => {
  const o_capture = new O_capture();
  let n_frames = 0, s_error = "";
  let f_resolve;
  const o_ready = new Promise((f_done) => f_resolve = f_done);
  const n_timeout = setTimeout(() => f_resolve(), 5000);
  try {
    o_capture.f_start(["-re", "-f", "lavfi", "-i", "testsrc=size=64x48:rate=15"], {
      n_width: 64,
      n_height: 48,
      n_fps: 15,
    }, (a_frame) => {
      f_assert(a_frame[0] === 255 && a_frame[1] === 216 && a_frame.at(-1) === 217);
      if (++n_frames >= 3) f_resolve();
    }, (s_message) => {
      s_error = s_message;
      f_resolve();
    });
    await o_ready;
  } finally {
    clearTimeout(n_timeout);
    await o_capture.f_stop();
  }
  f_assert(n_frames >= 3, s_error || "No frames received");
  f_assert(s_error === "", s_error);
  f_assert(o_capture.b_stopped);
});
