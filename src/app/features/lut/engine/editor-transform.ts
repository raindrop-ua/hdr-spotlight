import type { Lut3D } from '@features/lut/models/lut.model';
import {
  CURVE_CHANNELS,
  IDENTITY_CURVE,
  type LutEditorDocument,
  type ToneSettings,
} from '@features/lut/models/lut-editor.model';
import { createFloatLutSampler, validateFloatLut } from './float-lut-sampler';

const clamp = (value: number): number => Math.max(0, Math.min(1, value));
const luma = (r: number, g: number, b: number): number => r + 0.7152 * (g - r) + 0.0722 * (b - r);

function range(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
}

function validateCurve(points: number[]): void {
  if (
    !Array.isArray(points) ||
    points.length !== 5 ||
    Array.from(points).some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw new Error('Each curve must contain five output values between 0 and 1.');
  }
}

export function validateEditorDocument(document: LutEditorDocument): void {
  if (
    !document ||
    typeof document !== 'object' ||
    typeof document.name !== 'string' ||
    !document.name.trim() ||
    document.name.length > 80 ||
    (document.size !== 33 && document.size !== 65)
  ) {
    throw new Error('Choose a project name of up to 80 characters and a 33 or 65 point LUT.');
  }
  if (document.base !== null) validateFloatLut(document.base);
  const settings = document.settings;
  if (
    !settings ||
    typeof settings !== 'object' ||
    !settings.curves ||
    typeof settings.curves !== 'object'
  ) {
    throw new Error('This project is missing its color settings.');
  }
  range(settings.baseIntensity, 0, 100, 'Base intensity');
  range(settings.exposure, -3, 3, 'Exposure');
  range(settings.contrast, -100, 100, 'Contrast');
  range(settings.saturation, 0, 200, 'Saturation');
  range(settings.temperature, -100, 100, 'Temperature');
  range(settings.tint, -100, 100, 'Tint');
  for (const key of ['shadows', 'midtones', 'highlights'] as const) {
    const tone = settings[key];
    if (!tone || typeof tone !== 'object')
      throw new Error(`This project is missing its ${key} tone.`);
    range(tone.hue, 0, 360, `${key} hue`);
    range(tone.saturation, 0, 100, `${key} saturation`);
  }
  for (const channel of CURVE_CHANNELS) validateCurve(settings.curves[channel]);
}

function endpointSlope(first: number, second: number): number {
  const slope = (3 * first - second) / 2;
  if (Math.sign(slope) !== Math.sign(first)) return 0;
  return Math.sign(first) !== Math.sign(second) && Math.abs(slope) > Math.abs(3 * first)
    ? 3 * first
    : slope;
}

/** PCHIP has smooth joins and remains inside each segment's output endpoints. */
function prepareCurve(points: number[]): (x: number) => number {
  const delta = Array.from({ length: 4 }, (_, index) => 4 * (points[index + 1] - points[index]));
  const slopes = [endpointSlope(delta[0], delta[1]), 0, 0, 0, endpointSlope(delta[3], delta[2])];
  for (let index = 1; index < 4; index++) {
    const before = delta[index - 1];
    const after = delta[index];
    slopes[index] = before * after <= 0 ? 0 : (2 * before * after) / (before + after);
  }
  const coefficients = delta.map((_, index) => {
    const start = points[index];
    const end = points[index + 1];
    const a = 0.25 * slopes[index];
    const b = 0.25 * slopes[index + 1];
    return [start, a, 3 * (end - start) - 2 * a - b, 2 * (start - end) + a + b];
  });
  return (value: number): number => {
    const position = clamp(value) * 4;
    const segment = Math.min(3, Math.floor(position));
    const t = position - segment;
    const [a, b, c, d] = coefficients[segment];
    return Math.max(
      Math.min(points[segment], points[segment + 1]),
      Math.min(Math.max(points[segment], points[segment + 1]), a + t * (b + t * (c + t * d))),
    );
  };
}

export function evaluateCurve(points: number[], x: number): number {
  validateCurve(points);
  if (!Number.isFinite(x)) throw new Error('Curve input must be finite.');
  return prepareCurve(points)(x);
}

function smoothstep(low: number, high: number, value: number): number {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
}

const toLinear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toSrgb = (value: number): number =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

function toneDirection(tone: ToneSettings): number[] {
  const hue = (tone.hue % 360) / 60;
  const x = 1 - Math.abs((hue % 2) - 1);
  const colors = [
    [1, x, 0],
    [x, 1, 0],
    [0, 1, x],
    [0, x, 1],
    [x, 0, 1],
    [1, 0, x],
  ];
  return colors[Math.floor(hue)].map((value) => ((value - 0.5) * 0.36 * tone.saturation) / 100);
}

function saturate(rgb: Float64Array, factor: number): void {
  const gray = luma(rgb[0], rgb[1], rgb[2]);
  let limited = factor;
  for (let channel = 0; channel < 3; channel++) {
    const difference = rgb[channel] - gray;
    if (difference > 0) limited = Math.min(limited, (1 - gray) / difference);
    else if (difference < 0) limited = Math.min(limited, -gray / difference);
  }
  for (let channel = 0; channel < 3; channel++)
    rgb[channel] = clamp(gray + (rgb[channel] - gray) * limited);
}

function safeTitle(value: string): string {
  return (
    value
      .replace(/["\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
      .trim()
      .slice(0, 80) || 'My LUT'
  );
}

/**
 * Work in float throughout: base LUT → base mix → linear exposure/white balance →
 * encoded-sRGB contrast/saturation → tonal color → master curve → RGB curves.
 * The SDR exposure stage clips only values outside its supported 0–1 output range.
 */
export function bakeEditorLut(document: LutEditorDocument): Lut3D {
  validateEditorDocument(document);
  const { settings, size } = document;
  const base =
    document.base && settings.baseIntensity > 0 ? createFloatLutSampler(document.base) : null;
  const intensity = settings.baseIntensity / 100;
  const curves = CURVE_CHANNELS.map((channel) => prepareCurve(settings.curves[channel]));
  const identityCurves = CURVE_CHANNELS.every((channel) =>
    settings.curves[channel].every((value, i) => value === IDENTITY_CURVE[i]),
  );
  const identity =
    settings.exposure === 0 &&
    settings.contrast === 0 &&
    settings.saturation === 100 &&
    settings.temperature === 0 &&
    settings.tint === 0 &&
    settings.shadows.saturation === 0 &&
    settings.midtones.saturation === 0 &&
    settings.highlights.saturation === 0 &&
    identityCurves;
  const needsLinear = settings.exposure !== 0 || settings.temperature !== 0 || settings.tint !== 0;
  const gains = [
    2 ** (settings.exposure + (0.3 * settings.temperature) / 100 + (0.1 * settings.tint) / 100),
    2 ** (settings.exposure - (0.2 * settings.tint) / 100),
    2 ** (settings.exposure - (0.3 * settings.temperature) / 100 + (0.1 * settings.tint) / 100),
  ];
  const directions = [
    toneDirection(settings.shadows),
    toneDirection(settings.midtones),
    toneDirection(settings.highlights),
  ];
  const hasToning = [settings.shadows, settings.midtones, settings.highlights].some(
    (tone) => tone.saturation > 0,
  );
  const values = new Float32Array(size ** 3 * 3);
  const rgb = new Float64Array(3);
  let index = 0;
  for (let blue = 0; blue < size; blue++) {
    for (let green = 0; green < size; green++) {
      for (let red = 0; red < size; red++) {
        const r = red / (size - 1),
          g = green / (size - 1),
          b = blue / (size - 1);
        if (base) {
          base(r, g, b, rgb);
          rgb[0] = clamp(r + (rgb[0] - r) * intensity);
          rgb[1] = clamp(g + (rgb[1] - g) * intensity);
          rgb[2] = clamp(b + (rgb[2] - b) * intensity);
        } else {
          rgb[0] = r;
          rgb[1] = g;
          rgb[2] = b;
        }
        if (!identity) {
          for (let channel = 0; channel < 3; channel++) {
            if (needsLinear) rgb[channel] = clamp(toSrgb(toLinear(rgb[channel]) * gains[channel]));
            const value = rgb[channel];
            rgb[channel] =
              value + (settings.contrast / 100) * value * (1 - value) * (2 * value - 1);
          }
          if (settings.saturation !== 100) saturate(rgb, settings.saturation / 100);
          if (hasToning) {
            const gray = luma(rgb[0], rgb[1], rgb[2]);
            const interior = 4 * gray * (1 - gray);
            const shadows = 1 - smoothstep(0.15, 0.65, gray);
            const highlights = smoothstep(0.35, 0.85, gray);
            const midtones = Math.max(0, 1 - shadows - highlights);
            for (let channel = 0; channel < 3; channel++) {
              const amount =
                interior *
                (directions[0][channel] * shadows +
                  directions[1][channel] * midtones +
                  directions[2][channel] * highlights);
              rgb[channel] =
                amount >= 0
                  ? rgb[channel] + (1 - rgb[channel]) * amount
                  : rgb[channel] * (1 + amount);
            }
          }
          if (!identityCurves)
            for (let channel = 0; channel < 3; channel++)
              rgb[channel] = curves[channel + 1](curves[0](rgb[channel]));
        }
        values[index++] = clamp(rgb[0]);
        values[index++] = clamp(rgb[1]);
        values[index++] = clamp(rgb[2]);
      }
    }
  }
  return {
    title: safeTitle(document.name),
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    values,
  };
}
