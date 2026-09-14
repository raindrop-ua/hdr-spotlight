import { OutputSizeSettings } from './bench.models';

export const MAX_OUTPUT_SIDE = 16_384;
export const MAX_OUTPUT_PIXELS = 16_777_216;

export interface ImageDimensions {
  width: number;
  height: number;
}

export function outputSizeError(settings: OutputSizeSettings): string {
  if (settings.size === 0) return '';
  const width = settings.size === 'custom' ? settings.customWidth : settings.size;
  const height = settings.size === 'custom' ? settings.customHeight : settings.size;
  if (
    width === null ||
    height === null ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return 'Enter a whole number of pixels for both dimensions.';
  }
  if (width > MAX_OUTPUT_SIDE || height > MAX_OUTPUT_SIDE) {
    return 'Each side can be up to 16,384 pixels.';
  }
  return width * height > MAX_OUTPUT_PIXELS
    ? 'Keep the output within 16 megapixels (for example, 4096 × 4096).'
    : '';
}

export function outputDimensions(
  source: ImageDimensions,
  settings: OutputSizeSettings,
): ImageDimensions {
  const error = outputSizeError(settings);
  if (error) throw new RangeError(error);
  if (settings.size === 0) return { width: source.width, height: source.height };
  return settings.size === 'custom'
    ? { width: settings.customWidth!, height: settings.customHeight! }
    : { width: settings.size, height: settings.size };
}

export function imagePlacement(
  source: ImageDimensions,
  target: ImageDimensions,
  preserveAspectRatio: boolean,
) {
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = preserveAspectRatio ? source.width * scale : target.width;
  const height = preserveAspectRatio ? source.height * scale : target.height;
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height };
}
