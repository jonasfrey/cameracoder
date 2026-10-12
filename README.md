# CameraCoder

Local USB camera workspace. Deno backend · Vue + vanilla JavaScript · WebSocket.

```sh
npm ci
deno task start
```

Open **http://127.0.0.1:8080**. Requires Deno 2 and npm for dependency installation. No frontend
build. Vue is served locally.

Image tools require WebGL2 and OffscreenCanvas. GLSL shaders run in a worker; motion and trace
history stay in GPU textures. Processed ImageBitmaps transfer directly to the preview. Only the
histogram reads pixels back to the CPU (at most 64 × 36 samples); PNG capture reads the displayed
image. Custom channel expressions compile to GLSL. Unsupported or lost WebGL contexts show an error.

- **Browser cameras:** enable access, select a camera, start preview. Localhost or HTTPS required.
- **Host cameras:** Linux V4L2 devices. Install `ffmpeg` and `v4l-utils`. The server user needs
  camera access.
- **Test source:** generated animation; no hardware or permission required.
- **Capture:** processed PNG, at the selected process width. No server image storage.
- **Panels:** drag headers; close or reopen from the toolbar. Arrow keys move a focused grip.
- **Find a tool:** toolbar search or `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS). Search settings,
  effects, cameras, and actions. Use arrows + Enter; Escape closes search. Choosing a setting opens
  its panel and focuses the input.
- **Changes:** non-default settings appear as icon chips above the preview, including saved image
  settings. Click a chip to reset only that control; scroll the strip for more. Expression drafts
  are marked. Resetting capture size, frame rate, or camera source stops active capture.

Tools: brightness, contrast, gamma curve, shadows, highlights, edges, emboss, monochrome, negative,
exposure zebra, black/white clipping, RGB focus peaking, twist, RGB offset, motion highlights,
motion-only image processing, frame trace, custom pixel expressions.

Shortcuts: `Ctrl+Shift+P` search · `S` capture · `Space` freeze/resume · `G` thirds · `B` original ·
`Esc` close search / hide panels. Tone sliders: double-click to reset. Image settings persist
locally. Reset restores defaults. Stop the camera before changing capture size or frame rate.
Browser capture uses the nearest supported size. Host capture requires the exact selected size and
frame rate. Process width limits GPU work; it never enlarges the source. FPS and processing time are
live measurements. The last frame remains visible after stopping. Freeze pauses display processing;
Stop releases capture.

Custom expressions: one expression per channel. Variables `r g b l` (0–255), `x y` (0–1), `t`
(seconds), `pi`. Operators `+ - * / % **`. Functions `sin cos abs sqrt floor ceil round`,
`min(a,b)`, `max(a,b)`, `pow(a,b)`, `clamp(value,min,max)`, `mix(a,b,t)`, `step(edge,value)`.
Example: `255-r`, `255-g`, `255-b`. No loops, property access, or I/O. Outputs clamp to 0–255.
Shaders use 32-bit floating-point math; rounding can differ slightly from JavaScript doubles.

```sh
deno task check
deno task test
npm run test:browser
```

Browser tests use system Chrome at `/usr/bin/google-chrome` and a simulated camera. Set
`CHROME_PATH` for another Chromium executable. FFmpeg is required for the capture test. Screenshots
and a captured PNG go to `test-results/`. GPU tests compare rendered output against the CPU
reference in `shared/filters.js`, including orientation, custom expressions, and history resets.
Live processing uses `public/gpu.js`.

`PORT` overrides 8080. `HOST` overrides 127.0.0.1. Keep the loopback default. Host camera access has
no user authentication. Browser cameras belong to the browser device; host cameras belong to the
Deno machine. The same physical camera can appear in both lists. Only one path may capture it at a
time.

Troubleshooting: permission denied → browser camera permission; busy device → close other camera
apps; host timeout → lower capture size/FPS; slow filters → lower process width; no host cameras →
check `v4l2-ctl --list-devices` and device permissions. Windows/macOS use browser capture.

Source: `server.js`, `server/`, `public/`, `shared/`. Tests: `tests/`. Naming: APN prefixes.
Glossary: [docs/glossary.md](docs/glossary.md). Human content under `docs/hgc/` is preserved.
