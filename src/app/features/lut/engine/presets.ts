import type { Lut3D } from '@features/lut/models/lut.model';

export type LutPreset = 'original' | 'warm' | 'cool' | 'soft';

const titles = { warm: 'Warm daylight', cool: 'Cool shade', soft: 'Soft matte' } as const;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** Small, generated sRGB looks let the sample image work without downloading a LUT. */
export function createPresetLut(id: Exclude<LutPreset, 'original'>): Lut3D {
  if (!Object.hasOwn(titles, id)) throw new Error('Unknown LUT preset.');
  const size = 17;
  const values = new Float32Array(size ** 3 * 3);
  let index = 0;
  for (let blue = 0; blue < size; blue++) {
    for (let green = 0; green < size; green++) {
      for (let red = 0; red < size; red++) {
        const r = red / (size - 1);
        const g = green / (size - 1);
        const b = blue / (size - 1);
        const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
        let output: [number, number, number];
        if (id === 'warm') {
          output = [r * 1.035 + 0.018 * (1 - r), g * 1.005, b * 0.94];
        } else if (id === 'cool') {
          const shadows = (1 - luma) ** 2;
          output = [r * 0.97, g + 0.018 * shadows, b + 0.055 * shadows];
        } else {
          output = [r, g, b].map((value) =>
            clamp((luma + (value - luma) * 0.85) * 0.9 + 0.045),
          ) as [number, number, number];
        }
        values[index++] = clamp(output[0]);
        values[index++] = clamp(output[1]);
        values[index++] = clamp(output[2]);
      }
    }
  }
  return { title: titles[id], size, domainMin: [0, 0, 0], domainMax: [1, 1, 1], values };
}
