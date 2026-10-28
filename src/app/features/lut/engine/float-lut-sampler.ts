import type { Lut3D } from '@features/lut/models/lut.model';
import { MAX_LUT_SIZE } from './cube';

export function validateFloatLut(lut: Lut3D): void {
  if (
    !lut ||
    typeof lut.title !== 'string' ||
    !Number.isInteger(lut.size) ||
    lut.size < 2 ||
    lut.size > MAX_LUT_SIZE ||
    !(lut.values instanceof Float32Array) ||
    lut.values.length !== lut.size ** 3 * 3 ||
    lut.values.some((value) => !Number.isFinite(value)) ||
    !Array.isArray(lut.domainMin) ||
    !Array.isArray(lut.domainMax) ||
    lut.domainMin.length !== 3 ||
    lut.domainMax.length !== 3 ||
    Array.from(lut.domainMin).some(
      (minimum, channel) =>
        !Number.isFinite(minimum) ||
        !Number.isFinite(lut.domainMax[channel]) ||
        minimum >= lut.domainMax[channel] ||
        !Number.isFinite(lut.domainMax[channel] - minimum) ||
        !Number.isFinite(1 / (lut.domainMax[channel] - minimum)),
    )
  ) {
    throw new Error('Invalid 3D LUT table or input domain.');
  }
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** Tetrahedral sampling without image quantization; the caller reuses the output buffer. */
export function createFloatLutSampler(lut: Lut3D) {
  validateFloatLut(lut);
  const last = lut.size - 1;
  const greenStride = lut.size * 3;
  const blueStride = lut.size * greenStride;
  const opposite = 3 + greenStride + blueStride;
  const inverse = lut.domainMin.map((minimum, channel) => 1 / (lut.domainMax[channel] - minimum));
  return (red: number, green: number, blue: number, output: Float64Array): void => {
    const rPos = clamp((red - lut.domainMin[0]) * inverse[0]) * last;
    const gPos = clamp((green - lut.domainMin[1]) * inverse[1]) * last;
    const bPos = clamp((blue - lut.domainMin[2]) * inverse[2]) * last;
    const ri = Math.min(Math.floor(rPos), last - 1);
    const gi = Math.min(Math.floor(gPos), last - 1);
    const bi = Math.min(Math.floor(bPos), last - 1);
    const r = rPos - ri;
    const g = gPos - gi;
    const b = bPos - bi;
    const origin = ri * 3 + gi * greenStride + bi * blueStride;
    let first: number;
    let second: number;
    let w0: number;
    let w1: number;
    let w2: number;
    let w3: number;
    if (r >= g) {
      if (g >= b) {
        first = 3;
        second = 3 + greenStride;
        w0 = 1 - r;
        w1 = r - g;
        w2 = g - b;
        w3 = b;
      } else if (r >= b) {
        first = 3;
        second = 3 + blueStride;
        w0 = 1 - r;
        w1 = r - b;
        w2 = b - g;
        w3 = g;
      } else {
        first = blueStride;
        second = 3 + blueStride;
        w0 = 1 - b;
        w1 = b - r;
        w2 = r - g;
        w3 = g;
      }
    } else if (b >= g) {
      first = blueStride;
      second = greenStride + blueStride;
      w0 = 1 - b;
      w1 = b - g;
      w2 = g - r;
      w3 = r;
    } else if (b >= r) {
      first = greenStride;
      second = greenStride + blueStride;
      w0 = 1 - g;
      w1 = g - b;
      w2 = b - r;
      w3 = r;
    } else {
      first = greenStride;
      second = 3 + greenStride;
      w0 = 1 - g;
      w1 = g - r;
      w2 = r - b;
      w3 = b;
    }
    for (let channel = 0; channel < 3; channel++) {
      const index = origin + channel;
      output[channel] =
        lut.values[index] * w0 +
        lut.values[index + first] * w1 +
        lut.values[index + second] * w2 +
        lut.values[index + opposite] * w3;
    }
  };
}
