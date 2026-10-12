import { f_handler } from "../../server.js";
import { O_capture } from "../../server/cameras.js";

class O_test_capture extends O_capture {
  f_start(_a_input, o_options, f_frame, f_error) {
    super.f_start(
      ["-re", "-f", "lavfi", "-i", "testsrc=size=640x480:rate=30"],
      o_options,
      f_frame,
      f_error,
    );
  }
}

Deno.serve(
  { hostname: "127.0.0.1", port: 8788 },
  f_handler({
    f_discover: () =>
      Promise.resolve({
        a_cameras: [{ s_id: "/dev/video-test", s_label: "FFmpeg test camera", s_kind: "host" }],
        a_warnings: [],
      }),
    f_create_capture: () => new O_test_capture(),
  }),
);
