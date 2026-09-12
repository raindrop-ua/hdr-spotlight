import type { PixelImage, PixelOptions, EncodeStats, GlowMode } from '../models/bench.models';

import {
  DIFFUSE_WHITE_NITS,
  PQ_PEAK_NITS,
  RGB_709_TO_2020,
  LUMA_2020,
  SRGB_TO_LINEAR,
  pqOETFFast,
  smoothstep,
} from '../engine/color';

export const GLOW_MODES = Object.freeze({
  // Apply the same exposure multiplier to every pixel.
  ALL: 'all',

  // Select bright colors using weighted sRGB channel values.
  BRIGHT: 'bright',

  // Require every channel to be bright, favoring near-neutral whites.
  WHITES: 'whites',
} as const satisfies Record<'ALL' | 'BRIGHT' | 'WHITES', GlowMode>);

// Repeat a 4x4-ordered dither pattern to reduce banding when quantizing PQ to 8 bits.
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

// Pixels above this luminance contribute to the reported glow coverage.
export const LIT_THRESHOLD_NITS = 1000;

// Mutate packed sRGB RGBA bytes in place into PQ-encoded BT.2020 RGBA.
export function encodeToPQ(image: PixelImage, options: Readonly<PixelOptions>): EncodeStats {
  const { data, width, height } = image;
  const {
    stops,
    mode = GLOW_MODES.ALL,
    threshold = 0.85,
    feather = 0.15,
    dither = true,
    preserveTransparency = false,
  } = options;

  // Validate once before any writes; invalid inputs must not leave a partially encoded image.
  if (
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    !Number.isSafeInteger(height) ||
    height <= 0 ||
    !Number.isSafeInteger(width * height * 4) ||
    !(data instanceof Uint8ClampedArray) ||
    data.length !== width * height * 4
  ) {
    throw new RangeError('Image dimensions must be positive integers matching the RGBA buffer.');
  }
  if (!Number.isFinite(stops) || !Number.isFinite(DIFFUSE_WHITE_NITS * Math.pow(2, stops))) {
    throw new RangeError('Exposure must produce a finite luminance.');
  }
  if (
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    threshold > 1 ||
    !Number.isFinite(feather) ||
    feather < 0 ||
    feather > 1
  ) {
    throw new RangeError('Threshold and feather must be finite values between 0 and 1.');
  }
  if (mode !== GLOW_MODES.ALL && mode !== GLOW_MODES.BRIGHT && mode !== GLOW_MODES.WHITES) {
    throw new TypeError('Unknown glow mode.');
  }
  if (typeof dither !== 'boolean' || typeof preserveTransparency !== 'boolean') {
    throw new TypeError('Dither and preserveTransparency must be booleans.');
  }

  const gain = Math.pow(2, stops) - 1;
  // The mask reaches full strength at threshold; feather sets the ramp width below it.
  const edge0 = Math.max(0, threshold - feather);
  const toPQScale = DIFFUSE_WHITE_NITS / PQ_PEAK_NITS;

  // Whites mode depends only on the minimum 8-bit channel: cache all 256 mask weights.
  const whiteWeights = mode === GLOW_MODES.WHITES ? new Float64Array(256) : null;
  if (whiteWeights) {
    for (let value = 0; value < whiteWeights.length; value++) {
      whiteWeights[value] = smoothstep(edge0, threshold, value / 255);
    }
  }

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
      const alpha = preserveTransparency ? data[i + 3] / 255 : 1;

      // Build the mask in source sRGB; apply the resulting gain in linear light.
      let weight = 1;
      if (mode === GLOW_MODES.BRIGHT) {
        weight = smoothstep(edge0, threshold, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
      } else if (whiteWeights) {
        weight = whiteWeights[Math.min(r, g, b)];
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
      // Weight coverage by opacity; invisible RGB must not affect the readout.
      if (nits > LIT_THRESHOLD_NITS) lit += alpha;
      if (alpha > 0 && nits > peak) peak = nits;
      if (R * toPQScale > 1 || G * toPQScale > 1 || B * toPQScale > 1) clipped += alpha;

      // Center the 16 offsets on zero; share each offset across RGB to keep neutrals neutral.
      const offset = dither ? (ditherRow[x & 3] + 0.5) / 16 - 0.5 : 0;
      data[i] = clamp8(255 * pqOETFFast(clamp01(R * toPQScale)) + offset);
      data[i + 1] = clamp8(255 * pqOETFFast(clamp01(G * toPQScale)) + offset);
      data[i + 2] = clamp8(255 * pqOETFFast(clamp01(B * toPQScale)) + offset);
      // Alpha is linear opacity, never PQ-encoded.
      if (!preserveTransparency) data[i + 3] = 255;
    }
  }

  // Fractions use the full image area; transparent pixels contribute zero coverage.
  const pixels = width * height;
  return {
    peakNits: peak,
    litFraction: lit / pixels,
    clippedFraction: clipped / pixels,
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp8(v: number): number {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}
