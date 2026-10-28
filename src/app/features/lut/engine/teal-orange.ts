import type { Lut3D } from '@features/lut/models/lut.model';

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

// A gentle S-curve retains both endpoints and remains monotonic across the SDR range.
const contrast = (value: number): number => value + 0.2 * value * (1 - value) * (2 * value - 1);

// Move toward a channel boundary rather than adding a constant that can clip detail.
const tint = (value: number, amount: number): number =>
  amount >= 0 ? value + (1 - value) * amount : value + value * amount;

/** Scale encoded-sRGB chroma while retaining luma and a common RGB hue direction. */
export function adjustLutSaturation(lut: Lut3D, factor: number): Lut3D {
  if (!Number.isFinite(factor) || factor < 0) {
    throw new Error('LUT saturation must be a finite non-negative factor.');
  }
  if (
    !Number.isInteger(lut.size) ||
    lut.size < 2 ||
    !(lut.values instanceof Float32Array) ||
    lut.values.length !== lut.size ** 3 * 3 ||
    lut.values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw new Error('LUT saturation requires a complete SDR RGB table within 0–1.');
  }

  const values = new Float32Array(lut.values.length);
  for (let index = 0; index < values.length; index += 3) {
    const red = lut.values[index];
    const green = lut.values[index + 1];
    const blue = lut.values[index + 2];
    // Equivalent to .2126R + .7152G + .0722B, with exact neutral RGB endpoints.
    const luma = red + 0.7152 * (green - red) + 0.0722 * (blue - red);
    let saturation = factor;
    for (let channel = 0; channel < 3; channel++) {
      const chroma = lut.values[index + channel] - luma;
      if (chroma > 0) saturation = Math.min(saturation, (1 - luma) / chroma);
      else if (chroma < 0) saturation = Math.min(saturation, -luma / chroma);
    }
    for (let channel = 0; channel < 3; channel++) {
      const value = luma + (lut.values[index + channel] - luma) * saturation;
      // The shared limit retains hue; this clamp only removes floating-point roundoff.
      values[index + channel] = Math.max(0, Math.min(1, value));
    }
  }
  return { ...lut, values };
}

function grade(red: number, green: number, blue: number): [number, number, number] {
  const r = contrast(red);
  const g = contrast(green);
  const b = contrast(blue);
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);

  // This protects warm orange hues, not particular objects or people's skin.
  const orange =
    smoothstep(0.03, 0.18, r - b) *
    smoothstep(0.015, 0.1, g - b) *
    (1 - smoothstep(0.16, 0.36, r - g));
  const greenDominance = smoothstep(0.02, 0.18, g - Math.max(r, b));
  const saturation = 1 - 0.07 * smoothstep(0.25, 0.8, chroma) - 0.055 * greenDominance;
  const rgb = [r, g, b].map((value) => luma + (value - luma) * saturation);

  // Taper grading toward black and white so the split tone lives inside the image.
  const interior = 4 * luma * (1 - luma);
  const shadows = interior * (1 - smoothstep(0.16, 0.65, luma)) * (1 - 0.85 * orange);
  const warmth = interior * smoothstep(0.3, 0.82, luma) * (1 - 0.55 * orange);
  return [
    tint(rgb[0], -0.15 * shadows + 0.09 * warmth),
    tint(rgb[1], 0.035 * shadows + 0.018 * warmth),
    tint(rgb[2], 0.075 * shadows - 0.11 * warmth),
  ];
}

/** An original creative look for encoded sRGB, baked independently of bundled film LUTs. */
export function createTealOrangeLut(saturation = 1.1): Lut3D {
  const size = 33;
  const values = new Float32Array(size ** 3 * 3);
  let index = 0;
  for (let blue = 0; blue < size; blue++) {
    for (let green = 0; green < size; green++) {
      for (let red = 0; red < size; red++) {
        const output = grade(red / (size - 1), green / (size - 1), blue / (size - 1));
        values[index++] = output[0];
        values[index++] = output[1];
        values[index++] = output[2];
      }
    }
  }
  return adjustLutSaturation(
    {
      title: 'Teal & Orange',
      size,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      values,
    },
    saturation,
  );
}
