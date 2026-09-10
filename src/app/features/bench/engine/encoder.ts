import type { PixelImage, PixelOptions, EncodeStats } from '../models/bench.models';

/**
 * The pixel transform: 8-bit sRGB in, 8-bit PQ-encoded BT.2020 out.
 *
 * Kept free of DOM references so it can be exercised directly under test.
 */

import {
  DIFFUSE_WHITE_NITS,
  PQ_PEAK_NITS,
  RGB_709_TO_2020,
  LUMA_2020,
  SRGB_TO_LINEAR,
  pqOETF,
  smoothstep,
} from './color';

/** Which pixels receive the boost. */
export const GLOW_MODES = Object.freeze({
  /** Flat lift on every pixel. What the reference logo did — safe on black. */
  ALL: 'all',
  /** Weighted by perceptual luma, so any bright hue lifts. */
  BRIGHT: 'bright',
  /** Weighted by the minimum channel, so only near-neutral whites lift. */
  WHITES: 'whites',
});

/** Ordered dither matrix. 8-bit PQ is coarse in the highlights; this breaks up
 *  the contouring that otherwise shows on gradients and soft edges. */
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Above this, a pixel counts as "glowing" for the coverage measurement. */
export const LIT_THRESHOLD_NITS = 1000;

/**
 * @param {{data: Uint8ClampedArray, width: number, height: number}} image  mutated in place
 * @param {object} options
 * @param {number} options.stops        boost in stops above diffuse white
 * @param {string} options.mode         one of GLOW_MODES
 * @param {number} options.threshold    0..1, where the highlight mask reaches full strength
 * @param {number} [options.feather]    width of the mask ramp below the threshold
 * @param {boolean} [options.dither]    defaults to true
 * @returns {{peakNits: number, litFraction: number, clippedFraction: number}}
 */
export function encodeToPQ(image: PixelImage, options: PixelOptions): EncodeStats {
  const { data, width, height } = image;
  const { stops, mode = GLOW_MODES.ALL, threshold = 0.85, feather = 0.15, dither = true } = options;

  const gain = Math.pow(2, stops) - 1;
  const edge0 = Math.max(0, threshold - feather);
  const toPQScale = DIFFUSE_WHITE_NITS / PQ_PEAK_NITS;

  let lit = 0;
  let clipped = 0;
  let peak = 0;

  for (let y = 0; y < height; y++) {
    const ditherRow = BAYER_4[y & 3];

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      let weight;
      if (mode === GLOW_MODES.ALL) {
        weight = 1;
      } else if (mode === GLOW_MODES.BRIGHT) {
        weight = smoothstep(edge0, threshold, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
      } else {
        weight = smoothstep(edge0, threshold, Math.min(r, g, b) / 255);
      }

      const multiplier = 1 + gain * weight;
      const lr = SRGB_TO_LINEAR[r] * multiplier;
      const lg = SRGB_TO_LINEAR[g] * multiplier;
      const lb = SRGB_TO_LINEAR[b] * multiplier;

      // Linear BT.709 -> linear BT.2020, still relative to diffuse white.
      const R = RGB_709_TO_2020[0] * lr + RGB_709_TO_2020[1] * lg + RGB_709_TO_2020[2] * lb;
      const G = RGB_709_TO_2020[3] * lr + RGB_709_TO_2020[4] * lg + RGB_709_TO_2020[5] * lb;
      const B = RGB_709_TO_2020[6] * lr + RGB_709_TO_2020[7] * lg + RGB_709_TO_2020[8] * lb;

      const nits = (LUMA_2020[0] * R + LUMA_2020[1] * G + LUMA_2020[2] * B) * DIFFUSE_WHITE_NITS;
      if (nits > LIT_THRESHOLD_NITS) lit++;
      if (nits > peak) peak = nits;
      if (R * toPQScale > 1 || G * toPQScale > 1 || B * toPQScale > 1) clipped++;

      const offset = dither ? ditherRow[x & 3] / 16 - 0.5 : 0;
      data[i] = clamp8(255 * pqOETF(clamp01(R * toPQScale)) + offset);
      data[i + 1] = clamp8(255 * pqOETF(clamp01(G * toPQScale)) + offset);
      data[i + 2] = clamp8(255 * pqOETF(clamp01(B * toPQScale)) + offset);
      data[i + 3] = 255; // JPEG has no alpha; the caller composited already
    }
  }

  const pixels = width * height;
  return {
    peakNits: peak,
    litFraction: lit / pixels,
    clippedFraction: clipped / pixels,
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp8(v: number) {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}
