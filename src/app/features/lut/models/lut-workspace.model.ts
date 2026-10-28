import { ImageSource } from '@shared/images/models/image-source.model';

export type LutFormat = 'png' | 'jpeg' | 'webp';

export interface LutSource extends ImageSource<ImageBitmap | HTMLImageElement> {
  demo: boolean;
  bytes: number;
}

export interface LutSettings {
  intensity: number;
  format: LutFormat;
  quality: number;
  background: string;
}

export interface LutPreview {
  originalUrl: string;
  url: string;
}

export interface LutResult {
  url: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  format: LutFormat;
}

export const DEFAULT_LUT_SETTINGS: LutSettings = {
  intensity: 100,
  format: 'png',
  quality: 92,
  background: '#ffffff',
};
