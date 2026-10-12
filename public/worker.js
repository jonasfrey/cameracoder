import { O_gpu_processor } from "/gpu.js";

let o_processor = null;
let n_generation = -1;

self.onmessage = (o_event) => {
  const o_data = o_event.data;
  const n_started = performance.now();
  let o_output = null;
  try {
    o_processor ??= new O_gpu_processor();
    if (o_data.n_generation !== n_generation) {
      n_generation = o_data.n_generation;
      o_processor.f_reset();
    }
    const { n_width, n_height } = o_data;
    o_output = o_processor.f_render(
      o_data.o_bitmap,
      n_width,
      n_height,
      o_data.o_settings,
      o_data.a_custom,
      o_data.n_time,
    );
    self.postMessage({
      n_generation,
      n_width,
      n_height,
      ...o_output,
      n_ms: performance.now() - n_started,
    }, [o_output.o_bitmap]);
  } catch (o_error) {
    o_output?.o_bitmap.close();
    o_processor?.f_dispose();
    o_processor = null;
    self.postMessage({ n_generation: o_data.n_generation, s_error: o_error.message });
  } finally {
    o_data.o_bitmap?.close();
  }
};
