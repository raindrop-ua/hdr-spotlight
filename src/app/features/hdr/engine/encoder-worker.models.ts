import type { EncodeSettings, EncodeStats, PixelImage } from '@features/hdr/models/bench.models';

export interface EncodeWorkerRequest {
  image: PixelImage;
  settings: EncodeSettings;
}

export interface EncodeWorkerResult {
  image: PixelImage;
  stats: EncodeStats;
}

export interface EncodeWorkerError {
  error: string;
}

export type EncodeWorkerResponse = EncodeWorkerResult | EncodeWorkerError;
