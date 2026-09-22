/// <reference lib="webworker" />
import { encodeToPQ } from './encoder';
import type { EncodeWorkerRequest, EncodeWorkerResponse } from './encoder-worker.models';

addEventListener('message', ({ data }: MessageEvent<EncodeWorkerRequest>): void => {
  try {
    const stats = encodeToPQ(data.image, data.settings);
    // Transfer ownership back to the caller without copying the pixel buffer.
    postMessage({ image: data.image, stats } satisfies EncodeWorkerResponse, [
      data.image.data.buffer,
    ]);
  } catch (error: unknown) {
    postMessage({
      error: error instanceof Error ? error.message : 'Could not encode this image.',
    } satisfies EncodeWorkerResponse);
  }
});
