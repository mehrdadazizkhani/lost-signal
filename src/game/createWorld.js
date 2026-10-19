import { createWorld as createWorldWebGL } from './createWorldWebGL.js';
import { createWorldWebGPU } from './createWorldWebGPU.js';

// Prefer the modern WebGPU renderer, but preserve the existing WebGL world on
// browsers or devices where WebGPU is unavailable or initialization fails.
export async function createWorld(container, options = {}) {
  if (!navigator.gpu) return createWorldWebGL(container, options);

  try {
    return await createWorldWebGPU(container, options);
  } catch (error) {
    console.warn('LOST SIGNAL: WebGPU initialization failed; falling back to WebGL.', error);
    container.replaceChildren();
    return createWorldWebGL(container, options);
  }
}
