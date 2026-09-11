// PQ encodes absolute luminance: 1 represents 10,000 nits.
// sRGB input is relative to white; the encoder sets its luminance before applying PQ.

const M1 = 2610 / 16384;
const M2 = (2523 / 4096) * 128;
const C1 = 3424 / 4096;
const C2 = (2413 / 4096) * 32;
const C3 = (2392 / 4096) * 32;

// Maximum luminance represented by a PQ code value of 1.
export const PQ_PEAK_NITS = 10000;

// BT.2408 graphics white: the baseline luminance before the exposure boost.
export const DIFFUSE_WHITE_NITS = 203;

// Code value (0..1) -> normalized luminance (0..1, where 1.0 = 10,000 nits).
export function pqEOTF(v: number): number {
  const p = Math.pow(Math.max(v, 0), 1 / M2);
  return Math.pow(Math.max(p - C1, 0) / (C2 - C3 * p), 1 / M1);
}

// Normalized luminance (0..1) -> code value (0..1).
export function pqOETF(y: number): number {
  const p = Math.pow(Math.max(y, 0), M1);
  return Math.pow((C1 + C2 * p) / (1 + C3 * p), M2);
}

// Encode absolute luminance as an 8-bit PQ value, capped at the PQ peak.
export function nitsToCode(nits: number): number {
  return Math.round(255 * pqOETF(Math.min(1, nits / PQ_PEAK_NITS)));
}

// 8-bit PQ code -> absolute nits.
export function codeToNits(code: number): number {
  return pqEOTF(code / 255) * PQ_PEAK_NITS;
}

// Convert linear BT.709 (sRGB primaries) to linear BT.2020.
// Both use D65 white, so chromatic adaptation is unnecessary.
// Row-major matrix: each row computes one output channel.
export const RGB_709_TO_2020 = [
  0.627404, 0.329283, 0.043313, 0.069097, 0.91954, 0.011362, 0.016391, 0.088013, 0.895595,
] as const;

// Weight linear BT.2020 channels to measure luminance for the image statistics.
export const LUMA_2020 = [0.2627, 0.678, 0.0593] as const;

// sRGB EOTF, tabulated for all 256 input codes.
export const SRGB_TO_LINEAR: Float64Array<ArrayBuffer> = ((): Float64Array<ArrayBuffer> => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const s = i / 255;
    t[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  return t;
})();

// Fade the highlight mask from zero to one between the two edges.
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Each exposure stop doubles the luminance relative to diffuse white.
export function stopsToNits(stops: number): number {
  return DIFFUSE_WHITE_NITS * Math.pow(2, stops);
}
