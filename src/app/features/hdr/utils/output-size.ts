import { OutputSizeSettings } from '@features/hdr/models/bench.models';

import { ImageDimensions } from '@shared/images/models/image-dimensions.model';
import { MAX_IMAGE_SIDE, MAX_IMAGE_PIXELS } from '@shared/images/constants/image-limits';

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
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    return 'Each side can be up to 16,384 pixels.';
  }
  return width * height > MAX_IMAGE_PIXELS
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
