import { f_capture_options, f_list_cameras, O_capture } from "./server/cameras.js";

const o_files = {
  "/": ["public/index.html", "text/html; charset=utf-8"],
  "/app.js": ["public/app.js", "text/javascript"],
  "/tool-search.js": ["public/tool-search.js", "text/javascript"],
  "/style.css": ["public/style.css", "text/css"],
  "/worker.js": ["public/worker.js", "text/javascript"],
  "/gpu.js": ["public/gpu.js", "text/javascript"],
  "/shared/expressions.js": ["shared/expressions.js", "text/javascript"],
  "/shared/filters.js": ["shared/filters.js", "text/javascript"],
  "/shared/settings.js": ["shared/settings.js", "text/javascript"],
  "/vendor/vue.js": ["node_modules/vue/dist/vue.esm-browser.prod.js", "text/javascript"],
  "/favicon.svg": ["public/favicon.svg", "image/svg+xml"],
};
const o_headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(self), microphone=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ws: wss:; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Cache-Control": "no-store",
};

export function f_handler(
  {
    s_hostname = "127.0.0.1",
    f_discover = f_list_cameras,
    f_create_capture = () => new O_capture(),
  } = {},
) {
  return async function f_request(o_request) {
    const o_url = new URL(o_request.url);
    if (
      !["0.0.0.0", "::"].includes(s_hostname) &&
      ![s_hostname, "localhost", "127.0.0.1", "[::1]"].includes(o_url.hostname)
    ) {
      return new Response("Invalid host", { status: 403 });
    }
    if (o_url.pathname === "/ws") {
      if (o_request.headers.get("origin") !== o_url.origin) {
        return new Response("Same-origin connections only", { status: 403 });
      }
      if (o_request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("WebSocket required", { status: 426 });
      }
      const { socket: o_socket, response: o_response } = Deno.upgradeWebSocket(o_request);
      let o_capture = null;
      let o_queue = Promise.resolve();
      let b_closed = false;
      let n_pending = 0;
      function f_send(s_type, o_data = {}) {
        if (o_socket.readyState === WebSocket.OPEN) {
          o_socket.send(JSON.stringify({ s_type, ...o_data }));
        }
      }
      async function f_stop() {
        const o_previous = o_capture;
        o_capture = null;
        await o_previous?.f_stop();
      }
      o_socket.onopen = () => f_send("hello", { n_version: 1 });
      o_socket.onmessage = (o_event) => {
        if (typeof o_event.data !== "string" || o_event.data.length > 8192 || n_pending >= 20) {
          o_socket.close(1008, "Invalid request");
          return;
        }
        n_pending++;
        let n_request;
        o_queue = o_queue.then(async () => {
          if (b_closed) return;
          const o_message = JSON.parse(o_event.data);
          n_request = Number.isSafeInteger(o_message?.n_request) ? o_message.n_request : undefined;
          switch (o_message?.s_type) {
            case "camera.list":
              f_send("camera.list", await f_discover());
              break;
            case "camera.start": {
              const o_options = f_capture_options(o_message);
              const { a_cameras } = await f_discover();
              const o_camera = a_cameras.find((o_item) => o_item.s_id === o_message.s_id);
              if (!o_camera) throw new Error("Camera unavailable. Refresh the camera list.");
              await f_stop();
              if (b_closed) return;
              const o_next = f_create_capture();
              o_capture = o_next;
              let b_started = false;
              o_next.f_start(
                [
                  "-f",
                  "v4l2",
                  "-framerate",
                  String(o_options.n_fps),
                  "-video_size",
                  `${o_options.n_width}x${o_options.n_height}`,
                  "-i",
                  o_camera.s_id,
                ],
                o_options,
                (a_frame) => {
                  if (o_capture !== o_next || b_closed) return;
                  if (!b_started) {
                    b_started = true;
                    f_send("camera.started", { s_id: o_camera.s_id, n_request, ...o_options });
                  }
                  if (
                    o_socket.readyState === WebSocket.OPEN &&
                    o_socket.bufferedAmount < 2 * 1024 * 1024
                  ) {
                    o_socket.send(a_frame);
                  }
                },
                (s_message) => {
                  if (o_capture === o_next) {
                    f_send("error", { s_message, s_context: "capture", n_request });
                    f_stop();
                  }
                },
              );
              break;
            }
            case "camera.stop":
              await f_stop();
              f_send("camera.stopped", { n_request });
              break;
            case "ping":
              f_send("pong");
              break;
            default:
              throw new Error("Unknown request.");
          }
        }).catch((o_error) => {
          f_send("error", {
            n_request,
            s_message: o_error instanceof Deno.errors.NotFound
              ? "Install FFmpeg to stream host cameras."
              : o_error.message,
          });
        }).finally(() => n_pending--);
      };
      o_socket.onclose = () => {
        b_closed = true;
        f_stop();
      };
      o_socket.onerror = () => {
        b_closed = true;
        f_stop();
      };
      return o_response;
    }
    if (!["GET", "HEAD"].includes(o_request.method)) {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (o_url.pathname === "/health") {
      return Response.json({ s_status: "ok" }, { headers: o_headers });
    }
    const a_file = o_files[o_url.pathname];
    if (!a_file) return new Response("Not found", { status: 404, headers: o_headers });
    try {
      const a_body = await Deno.readFile(new URL(a_file[0], import.meta.url));
      return new Response(o_request.method === "HEAD" ? null : a_body, {
        headers: { ...o_headers, "Content-Type": a_file[1] },
      });
    } catch {
      return new Response(
        a_file[0].startsWith("node_modules") ? "Run npm ci first." : "File unavailable",
        {
          status: 503,
          headers: o_headers,
        },
      );
    }
  };
}

if (import.meta.main) {
  const s_hostname = Deno.env.get("HOST") || "127.0.0.1";
  const n_port = Number(Deno.env.get("PORT") || 8080);
  if (!Number.isInteger(n_port) || n_port < 1 || n_port > 65535) throw new Error("Invalid PORT.");
  Deno.serve({ hostname: s_hostname, port: n_port }, f_handler({ s_hostname }));
}
