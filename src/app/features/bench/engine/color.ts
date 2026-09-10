/**
 * Colour science primitives.
 *
 * SMPTE ST 2084 (PQ) maps code values to *absolute* luminance in nits, unlike
 * sRGB where 1.0 means "whatever your display calls white". That is the whole
 * basis of the effect: we write a number of nits into the file, and an HDR
 * display honours it even when the surrounding page is at normal brightness.
 */

const M1 = 2610 / 16384;
const M2 = (2523 / 4096) * 128;
const C1 = 3424 / 4096;
const C2 = (2413 / 4096) * 32;
const C3 = (2392 / 4096) * 32;

/** PQ peak. Code value 1.0 means this many nits. */
export const PQ_PEAK_NITS = 10000;

/** BT.2408 "graphics white" — the luminance a normal white pixel should get. */
export const DIFFUSE_WHITE_NITS = 203;

/** Code value (0..1) -> normalised luminance (0..1, where 1.0 = 10,000 nits). */
export function pqEOTF(v: number) {
  const p = Math.pow(Math.max(v, 0), 1 / M2);
  return Math.pow(Math.max(p - C1, 0) / (C2 - C3 * p), 1 / M1);
}

/** Normalised luminance (0..1) -> code value (0..1). */
export function pqOETF(y: number) {
  const p = Math.pow(Math.max(y, 0), M1);
  return Math.pow((C1 + C2 * p) / (1 + C3 * p), M2);
}

/** Convenience: absolute nits -> 8-bit PQ code. */
export function nitsToCode(nits: number) {
  return Math.round(255 * pqOETF(Math.min(1, nits / PQ_PEAK_NITS)));
}

/** Convenience: 8-bit PQ code -> absolute nits. */
export function codeToNits(code: number) {
  return pqEOTF(code / 255) * PQ_PEAK_NITS;
}

/** Linear BT.709 (sRGB primaries) -> linear BT.2020. Both D65, no adaptation. */
export const RGB_709_TO_2020 = [
  0.627404, 0.329283, 0.043313, 0.069097, 0.91954, 0.011362, 0.016391, 0.088013, 0.895595,
];

/** BT.2020 luma coefficients, for measuring how much of a tile is lit. */
export const LUMA_2020 = [0.2627, 0.678, 0.0593];

/** sRGB EOTF, tabulated for all 256 input codes. */
export const SRGB_TO_LINEAR = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const s = i / 255;
    t[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  return t;
})();

/** Hermite smoothstep, used to feather the highlight mask. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Stops above diffuse white -> peak nits. */
export function stopsToNits(stops: number) {
  return DIFFUSE_WHITE_NITS * Math.pow(2, stops);
}
