import type { Lut3D } from '@features/lut/models/lut.model';

export type GeneratedLutPreset = 'warm' | 'cool' | 'soft';
export type LutPreset =
  | 'original'
  | GeneratedLutPreset
  | 'silver-mist'
  | 'amber-glow'
  | 'copper-trail'
  | 'alpine-film'
  | 'desert-bloom';

export interface LutPresetDefinition {
  id: LutPreset;
  name: string;
  description: string;
  asset?: string;
}

export const LUT_PRESETS: readonly LutPresetDefinition[] = [
  { id: 'original', name: 'Original', description: 'A clean starting point' },
  { id: 'warm', name: 'Warm daylight', description: 'A little golden warmth' },
  { id: 'cool', name: 'Cool shade', description: 'Fresh, quieter tones' },
  { id: 'soft', name: 'Soft matte', description: 'Gentle contrast, lifted shadows' },
  {
    id: 'silver-mist',
    name: 'Silver mist',
    description: 'Cool midtones, faded blacks',
    asset: '/luts/silver-mist.cube',
  },
  {
    id: 'amber-glow',
    name: 'Amber glow',
    description: 'Cool tones, warm highlights',
    asset: '/luts/amber-glow.cube',
  },
  {
    id: 'copper-trail',
    name: 'Copper trail',
    description: 'Rich warmth, muted blues',
    asset: '/luts/copper-trail.cube',
  },
  {
    id: 'alpine-film',
    name: 'Alpine film',
    description: 'Cool shadows, rosy midtones',
    asset: '/luts/alpine-film.cube',
  },
  {
    id: 'desert-bloom',
    name: 'Desert bloom',
    description: 'Warm highlights, teal blues',
    asset: '/luts/desert-bloom.cube',
  },
];

const titles = { warm: 'Warm daylight', cool: 'Cool shade', soft: 'Soft matte' } as const;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** Small, generated sRGB looks let the sample image work without downloading a LUT. */
export function createPresetLut(id: GeneratedLutPreset): Lut3D {
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
