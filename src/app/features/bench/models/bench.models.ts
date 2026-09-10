export type GlowMode = 'whites' | 'bright' | 'all';

export interface PixelOptions {
  stops: number;
  mode: GlowMode;
  threshold: number;
  feather?: number;
  dither?: boolean;
  preserveTransparency?: boolean;
}

export interface EncodeSettings extends PixelOptions {
  background: string;
  size: number;
  preserveTransparency: boolean;
}

export const DEFAULT_SETTINGS: Readonly<EncodeSettings> = {
  stops: 3.9,
  mode: 'whites',
  threshold: 0.85,
  background: '#000000',
  size: 400,
  preserveTransparency: false,
};

export interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface EncodeStats {
  peakNits: number;
  litFraction: number;
  clippedFraction: number;
}

export interface Cicp {
  colorPrimaries: number;
  transferCharacteristics: number;
  matrixCoefficients: number;
  videoFullRangeFlag: number;
}

export interface EncodeResult {
  jpegUrl: string;
  pngUrl: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  settings: EncodeSettings;
  stats: EncodeStats;
}
