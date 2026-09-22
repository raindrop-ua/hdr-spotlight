import { ImageDimensions } from '../models/image-dimensions.model';
import { MAX_IMAGE_SIDE, MAX_IMAGE_PIXELS } from '../constants/image-limits';

export function dimensionsError({ width, height }: ImageDimensions): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    return 'Enter a whole number of pixels for both dimensions.';
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS)
    return 'Use up to 16 megapixels and 16,384 pixels per side.';
  return '';
}
export function linkedDimensions(
  source: ImageDimensions,
  side: 'width' | 'height',
  value: number,
): ImageDimensions {
  return side === 'width'
    ? { width: value, height: Math.max(1, Math.round((value * source.height) / source.width)) }
    : { width: Math.max(1, Math.round((value * source.width) / source.height)), height: value };
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
