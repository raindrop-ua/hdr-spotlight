/// <reference lib="webworker" />
import { encodeToPQ } from './encoder';
import type { EncodeSettings, PixelImage } from '../models/bench.models';

addEventListener(
  'message',
  ({ data }: MessageEvent<{ image: PixelImage; settings: EncodeSettings }>) => {
    try {
      const stats = encodeToPQ(data.image, data.settings);
      postMessage({ image: data.image, stats }, [data.image.data.buffer]);
    } catch (error) {
      postMessage({
        error: error instanceof Error ? error.message : 'Could not encode this image.',
      });
    }
  },
);
