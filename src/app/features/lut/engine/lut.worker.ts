/// <reference lib="webworker" />
import type { Lut3D, LutPixels } from '@features/lut/models/lut.model';
import { applyLut } from './apply-lut';

addEventListener(
  'message',
  ({ data }: MessageEvent<{ image: LutPixels; lut: Lut3D; intensity: number }>): void => {
    try {
      applyLut(data.image, data.lut, data.intensity);
      postMessage({ image: data.image }, [data.image.data.buffer]);
    } catch (error: unknown) {
      postMessage({ error: error instanceof Error ? error.message : 'Could not apply this LUT.' });
    }
  },
);
