import { f_compile_custom_glsl } from "/shared/expressions.js";
import { f_normalize_settings } from "/shared/settings.js";

const s_vertex = `#version 300 es
void main() {
  vec2 a_position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
}`;
const s_header = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 a_size;
out vec4 a_color;
vec3 f_byte(vec3 a_value) { return roundEven(clamp(a_value, 0.0, 255.0)); }
ivec2 f_bound(ivec2 a_pixel) { return clamp(a_pixel, ivec2(0), ivec2(a_size) - 1); }
`;
const s_scale = `${s_header}
uniform sampler2D o_source;
void main() { a_color = vec4(texture(o_source, gl_FragCoord.xy / a_size).rgb, 1.0); }
`;
const s_tone = `${s_header}
uniform sampler2D o_raw;
uniform bool b_mirror, b_bypass;
uniform float n_twist, n_rgb, n_brightness, n_contrast, n_curve, n_shadows, n_lights;
void main() {
  vec2 a_pixel = floor(gl_FragCoord.xy);
  if (b_mirror) a_pixel.x = a_size.x - 1.0 - a_pixel.x;
  if (!b_bypass && n_twist != 0.0) {
    float n_radius = min(a_size.x, a_size.y) / 2.0;
    vec2 a_delta = (a_pixel - a_size / 2.0) / n_radius;
    float n_distance = length(a_delta);
    float n_angle = n_distance == 0.0 ? 0.0 : atan(a_delta.y, a_delta.x);
    n_angle += n_twist * pow(max(0.0, 1.0 - n_distance), 2.0);
    a_pixel = floor(clamp(a_size / 2.0 + vec2(cos(n_angle), sin(n_angle)) *
      n_distance * n_radius, vec2(0.0), a_size - 1.0) + 0.5);
  }
  ivec2 a_sample = ivec2(a_pixel);
  int n_offset = b_bypass ? 0 : int(floor(n_rgb + 0.5));
  vec3 a_value = vec3(
    texelFetch(o_raw, f_bound(a_sample + ivec2(n_offset, 0)), 0).r,
    texelFetch(o_raw, a_sample, 0).g,
    texelFetch(o_raw, f_bound(a_sample - ivec2(n_offset, 0)), 0).b) * 255.0;
  if (!b_bypass) {
    vec3 a_unit = a_value / 255.0;
    vec3 a_tone = a_value + n_shadows * (1.0 - a_unit) * (1.0 - a_unit) +
      n_lights * a_unit * a_unit;
    float n_factor = (100.0 + n_contrast) / max(1.0, 100.0 - n_contrast);
    a_value = 255.0 * pow(clamp(((a_tone - 128.0) * n_factor + 128.0 +
      n_brightness * 2.55) / 255.0, 0.0, 1.0), vec3(1.0 / n_curve));
  }
  a_color = vec4(f_byte(a_value) / 255.0, 1.0);
}`;

function f_effect_shader(a_custom) {
  const a_channels = a_custom ? f_compile_custom_glsl(a_custom) : null;
  return `${s_header}
uniform sampler2D o_tone, o_raw, o_previous, o_trace;
uniform bool b_bypass, b_mirror, b_previous, b_trace, b_motion_only;
uniform int n_filter, n_exposure, n_focus_color;
uniform float n_motion, n_trace, n_focus, n_under, n_over, n_time;
float f_finite(float n_value) { return isnan(n_value) || isinf(n_value) ? 0.0 : n_value; }
float f_div(float n_a, float n_b) { return n_b == 0.0 ? 0.0 : n_a / n_b; }
float f_mod(float n_a, float n_b) { return n_b == 0.0 ? 0.0 : n_a - n_b * trunc(n_a / n_b); }
float f_round(float n_value) { return floor(n_value + 0.5); }
float f_sqrt(float n_value) {
  return n_value < 0.0 ? uintBitsToFloat(0x7fc00000u) : sqrt(n_value);
}
float f_clamp(float n_value, float n_min, float n_max) {
  return min(n_max, max(n_min, f_finite(n_value)));
}
float f_pow(float n_a, float n_b) {
  if (n_b == 0.0) return 1.0;
  if (n_a == 0.0) return n_b > 0.0 ? 0.0 : uintBitsToFloat(0x7f800000u);
  if (n_a < 0.0) {
    if (n_b != trunc(n_b)) return uintBitsToFloat(0x7fc00000u);
    return pow(-n_a, n_b) * (mod(abs(n_b), 2.0) == 0.0 ? 1.0 : -1.0);
  }
  return pow(n_a, n_b);
}
float f_luma(ivec2 a_pixel) {
  return dot(texelFetch(o_tone, f_bound(a_pixel), 0).rgb * 255.0, vec3(0.2126, 0.7152, 0.0722));
}
vec3 f_custom(vec3 a_value, float x, float y, float t, float l) {
  float r = a_value.r, g = a_value.g, b = a_value.b;
  return ${
    a_channels
      ? `f_byte(vec3(${a_channels.map((s_channel) => `f_finite(${s_channel})`).join(",")}))`
      : "a_value"
  };
}
void main() {
  ivec2 a_pixel = ivec2(gl_FragCoord.xy);
  vec3 a_value = texelFetch(o_tone, a_pixel, 0).rgb * 255.0;
  if (b_bypass) { a_color = vec4(a_value / 255.0, 1.0); return; }
  float n_luma = f_luma(a_pixel), n_edge = 0.0;
  if (n_filter == 1 || n_focus_color != 0) {
    float n_tl = f_luma(a_pixel + ivec2(-1, -1));
    float n_tr = f_luma(a_pixel + ivec2(1, -1));
    float n_bl = f_luma(a_pixel + ivec2(-1, 1));
    float n_br = f_luma(a_pixel + ivec2(1, 1));
    float n_gx = -n_tl + n_tr - 2.0 * f_luma(a_pixel + ivec2(-1, 0)) +
      2.0 * f_luma(a_pixel + ivec2(1, 0)) - n_bl + n_br;
    float n_gy = -n_tl - 2.0 * f_luma(a_pixel + ivec2(0, -1)) - n_tr +
      n_bl + 2.0 * f_luma(a_pixel + ivec2(0, 1)) + n_br;
    n_edge = length(vec2(n_gx, n_gy)) / 4.0;
  }
  if (n_filter == 1) a_value = f_byte(vec3(n_edge));
  else if (n_filter == 2) a_value = f_byte(vec3(128.0 +
    (n_luma - f_luma(a_pixel + ivec2(-1, -1))) * 2.0));
  else if (n_filter == 3) a_value = f_byte(vec3(n_luma));
  else if (n_filter == 4) a_value = 255.0 - a_value;
  vec2 a_position = vec2(a_pixel) / max(vec2(1.0), a_size - 1.0);
  a_value = f_custom(a_value, a_position.x, a_position.y, n_time, n_luma);
  ivec2 a_raw_pixel = b_mirror ? ivec2(int(a_size.x) - 1 - a_pixel.x, a_pixel.y) : a_pixel;
  vec3 a_raw = texelFetch(o_raw, a_raw_pixel, 0).rgb * 255.0;
  vec3 a_difference = abs(a_raw - texelFetch(o_previous, a_raw_pixel, 0).rgb * 255.0);
  bool b_motion = b_previous && max(max(a_difference.r, a_difference.g), a_difference.b) > n_motion;
  if (n_trace > 0.0 && b_trace) {
    a_value = f_byte(mix(a_value, texelFetch(o_trace, a_pixel, 0).rgb * 255.0, n_trace));
  }
  if (n_motion > 0.0 && b_motion && !b_motion_only) {
    a_value = f_byte(a_value * 0.5 + vec3(0.0, 127.0, 100.0));
  }
  if (n_focus_color != 0 && n_edge > n_focus) {
    a_value = n_focus_color == 1 ? vec3(255, 0, 0) :
      n_focus_color == 2 ? vec3(0, 255, 0) : vec3(0, 0, 255);
  }
  if (n_exposure != 0 && (n_luma <= n_under || n_luma >= n_over)) {
    a_value = vec3(n_exposure == 1 ? ((a_pixel.x + a_pixel.y) % 12 < 6 ? 255.0 : 0.0) :
      (n_luma <= n_under ? 0.0 : 255.0));
  }
  if (n_motion > 0.0 && b_motion_only && !b_motion) a_value = a_raw;
  a_color = vec4(a_value / 255.0, 1.0);
}`;
}

const s_present = `${s_header}
uniform sampler2D o_image;
void main() {
  // Intermediate textures use image coordinates: row zero is the top of the source.
  ivec2 a_pixel = ivec2(gl_FragCoord.x, a_size.y - gl_FragCoord.y);
  a_color = texelFetch(o_image, a_pixel, 0);
}`;
const s_sample = `${s_header}
uniform sampler2D o_image;
uniform vec2 a_sample_size;
void main() {
  a_color = texelFetch(o_image, ivec2(gl_FragCoord.xy / a_sample_size * a_size), 0);
}`;

/** GPU image pipeline. Full frames and temporal history never need CPU pixel readback. */
export class O_gpu_processor {
  constructor(o_canvas = new OffscreenCanvas(1, 1)) {
    this.o_canvas = o_canvas;
    const o_gl = o_canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!o_gl) {
      throw new Error("WebGL2 is unavailable. Enable browser graphics acceleration and reload.");
    }
    this.o_gl = o_gl;
    this.a_programs = [];
    this.a_textures = [];
    this.n_width = 0;
    this.n_height = 0;
    this.n_current = 0;
    this.s_custom = "null";
    this.f_reset();
    try {
      o_gl.disable(o_gl.DITHER);
      this.o_framebuffer = o_gl.createFramebuffer();
      this.o_scale = this.f_program(s_scale);
      this.o_tone = this.f_program(s_tone);
      this.o_effect = this.f_program(f_effect_shader(null));
      this.o_present = this.f_program(s_present);
      this.o_sample = this.f_program(s_sample);
      this.o_upload = this.f_texture(true);
      this.a_raw = [this.f_texture(), this.f_texture()];
      this.o_toned = this.f_texture();
      this.a_output = [this.f_texture(), this.f_texture()];
      this.o_sampled = this.f_texture();
    } catch (o_error) {
      this.f_dispose();
      throw o_error;
    }
  }

  f_program(s_fragment) {
    const o_gl = this.o_gl, a_shaders = [];
    const o_program = o_gl.createProgram();
    try {
      for (
        const [n_type, s_source] of [[o_gl.VERTEX_SHADER, s_vertex], [
          o_gl.FRAGMENT_SHADER,
          s_fragment,
        ]]
      ) {
        const o_shader = o_gl.createShader(n_type);
        a_shaders.push(o_shader);
        o_gl.shaderSource(o_shader, s_source);
        o_gl.compileShader(o_shader);
        if (!o_gl.getShaderParameter(o_shader, o_gl.COMPILE_STATUS)) {
          throw new Error(`GLSL compilation failed: ${o_gl.getShaderInfoLog(o_shader)}`);
        }
        o_gl.attachShader(o_program, o_shader);
      }
      o_gl.linkProgram(o_program);
      if (!o_gl.getProgramParameter(o_program, o_gl.LINK_STATUS)) {
        throw new Error(`GLSL link failed: ${o_gl.getProgramInfoLog(o_program)}`);
      }
      this.a_programs.push(o_program);
      const o_uniforms = {};
      const n_count = o_gl.getProgramParameter(o_program, o_gl.ACTIVE_UNIFORMS);
      for (let n_i = 0; n_i < n_count; n_i++) {
        const o_uniform = o_gl.getActiveUniform(o_program, n_i);
        o_uniforms[o_uniform.name] = {
          o_location: o_gl.getUniformLocation(o_program, o_uniform.name),
          n_type: o_uniform.type,
        };
      }
      return { o_program, o_uniforms };
    } catch (o_error) {
      o_gl.deleteProgram(o_program);
      throw o_error;
    } finally {
      for (const o_shader of a_shaders) o_gl.deleteShader(o_shader);
    }
  }

  f_texture(b_linear = false) {
    const o_gl = this.o_gl, o_texture = o_gl.createTexture();
    this.a_textures.push(o_texture);
    o_gl.bindTexture(o_gl.TEXTURE_2D, o_texture);
    o_gl.texParameteri(
      o_gl.TEXTURE_2D,
      o_gl.TEXTURE_MIN_FILTER,
      b_linear ? o_gl.LINEAR : o_gl.NEAREST,
    );
    o_gl.texParameteri(
      o_gl.TEXTURE_2D,
      o_gl.TEXTURE_MAG_FILTER,
      b_linear ? o_gl.LINEAR : o_gl.NEAREST,
    );
    o_gl.texParameteri(o_gl.TEXTURE_2D, o_gl.TEXTURE_WRAP_S, o_gl.CLAMP_TO_EDGE);
    o_gl.texParameteri(o_gl.TEXTURE_2D, o_gl.TEXTURE_WRAP_T, o_gl.CLAMP_TO_EDGE);
    return o_texture;
  }

  f_allocate(o_texture, n_width, n_height) {
    const o_gl = this.o_gl;
    o_gl.bindTexture(o_gl.TEXTURE_2D, o_texture);
    o_gl.texImage2D(
      o_gl.TEXTURE_2D,
      0,
      o_gl.RGBA8,
      n_width,
      n_height,
      0,
      o_gl.RGBA,
      o_gl.UNSIGNED_BYTE,
      null,
    );
  }

  f_reset() {
    this.b_previous = false;
    this.b_trace = false;
  }

  f_resize(n_width, n_height) {
    if (n_width === this.n_width && n_height === this.n_height) return;
    this.n_width = this.o_canvas.width = n_width;
    this.n_height = this.o_canvas.height = n_height;
    this.f_reset();
    for (const o_texture of [...this.a_raw, this.o_toned, ...this.a_output]) {
      this.f_allocate(o_texture, n_width, n_height);
    }
    this.n_sample_width = Math.min(64, n_width);
    this.n_sample_height = Math.min(36, n_height);
    this.a_samples = new Uint8Array(this.n_sample_width * this.n_sample_height * 4);
    this.f_allocate(this.o_sampled, this.n_sample_width, this.n_sample_height);
  }

  f_draw(
    o_pass,
    o_target,
    o_textures,
    o_values = {},
    n_width = this.n_width,
    n_height = this.n_height,
  ) {
    const o_gl = this.o_gl;
    o_gl.bindFramebuffer(o_gl.FRAMEBUFFER, o_target ? this.o_framebuffer : null);
    if (o_target) {
      o_gl.framebufferTexture2D(
        o_gl.FRAMEBUFFER,
        o_gl.COLOR_ATTACHMENT0,
        o_gl.TEXTURE_2D,
        o_target,
        0,
      );
      if (o_gl.checkFramebufferStatus(o_gl.FRAMEBUFFER) !== o_gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("GPU frame allocation failed. Reduce the process width and try again.");
      }
    }
    o_gl.viewport(0, 0, n_width, n_height);
    o_gl.useProgram(o_pass.o_program);
    const o_uniform_values = { a_size: [this.n_width, this.n_height], ...o_values };
    Object.entries(o_textures).forEach(([s_name, o_texture], n_unit) => {
      o_gl.activeTexture(o_gl.TEXTURE0 + n_unit);
      o_gl.bindTexture(o_gl.TEXTURE_2D, o_texture);
      o_uniform_values[s_name] = n_unit;
    });
    for (const [s_name, o_uniform] of Object.entries(o_pass.o_uniforms)) {
      const o_value = o_uniform_values[s_name];
      if (o_uniform.n_type === o_gl.FLOAT_VEC2) o_gl.uniform2fv(o_uniform.o_location, o_value);
      else if (o_uniform.n_type === o_gl.FLOAT) o_gl.uniform1f(o_uniform.o_location, o_value);
      else o_gl.uniform1i(o_uniform.o_location, Number(o_value));
    }
    o_gl.drawArrays(o_gl.TRIANGLES, 0, 3);
  }

  f_render(o_bitmap, n_width, n_height, o_input, a_custom = null, n_time = 0) {
    const o_gl = this.o_gl;
    if (o_gl.isContextLost()) {
      throw new Error("WebGL context lost. Start the camera again to recover.");
    }
    const n_limit = o_gl.getParameter(o_gl.MAX_TEXTURE_SIZE);
    if (
      ![n_width, n_height, o_bitmap.width, o_bitmap.height].every(
        (n_value) => Number.isInteger(n_value) && n_value > 0 && n_value <= n_limit,
      )
    ) {
      throw new Error(
        "Frame size exceeds the GPU limit. Select a smaller capture size or process width.",
      );
    }
    this.f_resize(n_width, n_height);
    const s_custom = JSON.stringify(a_custom);
    if (s_custom !== this.s_custom) {
      const o_next = this.f_program(f_effect_shader(a_custom));
      o_gl.deleteProgram(this.o_effect.o_program);
      this.a_programs = this.a_programs.filter((o_program) =>
        o_program !== this.o_effect.o_program
      );
      this.o_effect = o_next;
      this.s_custom = s_custom;
    }
    const o_settings = f_normalize_settings(o_input);
    const n_current = this.n_current, n_previous = 1 - n_current;
    o_gl.bindTexture(o_gl.TEXTURE_2D, this.o_upload);
    // ImageBitmap upload retains its top-to-bottom rows; shaders use that convention internally.
    o_gl.texImage2D(o_gl.TEXTURE_2D, 0, o_gl.RGBA, o_gl.RGBA, o_gl.UNSIGNED_BYTE, o_bitmap);
    this.f_draw(this.o_scale, this.a_raw[n_current], { o_source: this.o_upload });
    this.f_draw(this.o_tone, this.o_toned, { o_raw: this.a_raw[n_current] }, o_settings);
    this.f_draw(this.o_effect, this.a_output[n_current], {
      o_tone: this.o_toned,
      o_raw: this.a_raw[n_current],
      o_previous: this.a_raw[n_previous],
      o_trace: this.a_output[n_previous],
    }, {
      ...o_settings,
      b_previous: this.b_previous,
      b_trace: this.b_trace,
      n_filter: ["none", "edge", "emboss", "mono", "invert"].indexOf(o_settings.s_filter),
      n_exposure: ["off", "zebra", "solid"].indexOf(o_settings.s_exposure),
      n_focus_color: ["off", "red", "green", "blue"].indexOf(o_settings.s_focus),
      n_time,
    });
    const o_image = this.a_output[n_current];
    this.f_draw(
      this.o_sample,
      this.o_sampled,
      { o_image },
      {
        a_sample_size: [this.n_sample_width, this.n_sample_height],
      },
      this.n_sample_width,
      this.n_sample_height,
    );
    // Bounded readback for the UI histogram only: at most 64 × 36 samples (9 KiB).
    o_gl.readPixels(
      0,
      0,
      this.n_sample_width,
      this.n_sample_height,
      o_gl.RGBA,
      o_gl.UNSIGNED_BYTE,
      this.a_samples,
    );
    const a_histogram = Array(64).fill(0);
    for (let n_i = 0; n_i < this.a_samples.length; n_i += 4) {
      const n_luma = this.a_samples[n_i] * 0.2126 + this.a_samples[n_i + 1] * 0.7152 +
        this.a_samples[n_i + 2] * 0.0722;
      a_histogram[Math.min(63, Math.floor(n_luma / 4))]++;
    }
    this.f_draw(this.o_present, null, { o_image });
    if (o_gl.isContextLost() || o_gl.getError() !== o_gl.NO_ERROR) {
      throw new Error(
        "WebGL processing failed. Start the camera again or reduce the process width.",
      );
    }
    this.b_previous = !o_settings.b_bypass && o_settings.n_motion > 0;
    this.b_trace = !o_settings.b_bypass && o_settings.n_trace > 0;
    this.n_current = n_previous;
    return { o_bitmap: this.o_canvas.transferToImageBitmap(), a_histogram };
  }

  f_dispose() {
    for (const o_texture of this.a_textures) this.o_gl.deleteTexture(o_texture);
    for (const o_program of this.a_programs) this.o_gl.deleteProgram(o_program);
    this.o_gl.deleteFramebuffer(this.o_framebuffer);
    this.a_textures = [];
    this.a_programs = [];
  }
}
