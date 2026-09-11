import type { PixelImage, PixelOptions, EncodeStats, GlowMode } from '../models/bench.models';

import {
  DIFFUSE_WHITE_NITS,
  PQ_PEAK_NITS,
  RGB_709_TO_2020,
  LUMA_2020,
  SRGB_TO_LINEAR,
  pqOETF,
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

  const gain = Math.pow(2, stops) - 1;
  // The mask reaches full strength at threshold; feather sets the ramp width below it.
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
      const alpha = preserveTransparency ? data[i + 3] / 255 : 1;

      // Build the mask in source sRGB; apply the resulting gain in linear light.
      let weight: number;
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
      // Weight coverage by opacity; invisible RGB must not affect the readout.
      if (nits > LIT_THRESHOLD_NITS) lit += alpha;
      if (alpha > 0 && nits > peak) peak = nits;
      if (R * toPQScale > 1 || G * toPQScale > 1 || B * toPQScale > 1) clipped += alpha;

      // One offset for all channels avoids adding a color tint to neutral pixels.
      const offset = dither ? ditherRow[x & 3] / 16 - 0.5 : 0;
      data[i] = clamp8(255 * pqOETF(clamp01(R * toPQScale)) + offset);
      data[i + 1] = clamp8(255 * pqOETF(clamp01(G * toPQScale)) + offset);
      data[i + 2] = clamp8(255 * pqOETF(clamp01(B * toPQScale)) + offset);
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
