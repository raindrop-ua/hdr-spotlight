import type { Lut3D, LutPixels } from '@features/lut/models/lut.model';
import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '@shared/images/constants/image-limits';
import { MAX_LUT_SIZE } from './cube';

function validateImage(image: LutPixels): void {
  if (
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > MAX_IMAGE_SIDE ||
    image.height > MAX_IMAGE_SIDE ||
    image.width * image.height > MAX_IMAGE_PIXELS ||
    !(image.data instanceof Uint8ClampedArray) ||
    image.data.length !== image.width * image.height * 4
  ) {
    throw new Error('Invalid image dimensions or RGBA pixel buffer.');
  }
}

function validateLut(lut: Lut3D, intensity: number): void {
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100) {
    throw new Error('LUT intensity must be between 0 and 100.');
  }
  if (
    !Number.isInteger(lut.size) ||
    lut.size < 2 ||
    lut.size > MAX_LUT_SIZE ||
    !(lut.values instanceof Float32Array) ||
    lut.values.length !== lut.size ** 3 * 3 ||
    lut.values.some((value) => !Number.isFinite(value)) ||
    lut.domainMin.length !== 3 ||
    lut.domainMax.length !== 3 ||
    lut.domainMin.some(
      (minimum, channel) =>
        !Number.isFinite(minimum) ||
        !Number.isFinite(lut.domainMax[channel]) ||
        minimum >= lut.domainMax[channel] ||
        !Number.isFinite(1 / (lut.domainMax[channel] - minimum)),
    )
  ) {
    throw new Error('Invalid 3D LUT table or input domain.');
  }
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** Prepare one validated LUT for a complete image or a sequence of cancellable strips. */
export function createLutTransform(lut: Lut3D, intensity: number): (image: LutPixels) => void {
  validateLut(lut, intensity);
  const strength = intensity / 100;
  const last = lut.size - 1;
  const greenStride = lut.size * 3;
  const blueStride = lut.size * greenStride;
  const maximumOffset = 3 + greenStride + blueStride;
  const inverseDomain = lut.domainMin.map(
    (minimum, channel) => 1 / (lut.domainMax[channel] - minimum),
  );
  const values = lut.values;

  return (image: LutPixels): void => {
    validateImage(image);
    if (intensity === 0) return;
    for (let pixel = 0; pixel < image.data.length; pixel += 4) {
      const red = clamp((image.data[pixel] / 255 - lut.domainMin[0]) * inverseDomain[0]) * last;
      const green =
        clamp((image.data[pixel + 1] / 255 - lut.domainMin[1]) * inverseDomain[1]) * last;
      const blue =
        clamp((image.data[pixel + 2] / 255 - lut.domainMin[2]) * inverseDomain[2]) * last;
      const redIndex = Math.min(Math.floor(red), last - 1);
      const greenIndex = Math.min(Math.floor(green), last - 1);
      const blueIndex = Math.min(Math.floor(blue), last - 1);
      const r = red - redIndex;
      const g = green - greenIndex;
      const b = blue - blueIndex;
      const origin = redIndex * 3 + greenIndex * greenStride + blueIndex * blueStride;

      let first: number;
      let second: number;
      let w0: number;
      let w1: number;
      let w2: number;
      let w3: number;
      if (r >= g) {
        if (g >= b) {
          first = 3;
          second = 3 + greenStride;
          w0 = 1 - r;
          w1 = r - g;
          w2 = g - b;
          w3 = b;
        } else if (r >= b) {
          first = 3;
          second = 3 + blueStride;
          w0 = 1 - r;
          w1 = r - b;
          w2 = b - g;
          w3 = g;
        } else {
          first = blueStride;
          second = 3 + blueStride;
          w0 = 1 - b;
          w1 = b - r;
          w2 = r - g;
          w3 = g;
        }
      } else if (b >= g) {
        first = blueStride;
        second = greenStride + blueStride;
        w0 = 1 - b;
        w1 = b - g;
        w2 = g - r;
        w3 = r;
      } else if (b >= r) {
        first = greenStride;
        second = greenStride + blueStride;
        w0 = 1 - g;
        w1 = g - b;
        w2 = b - r;
        w3 = r;
      } else {
        first = greenStride;
        second = 3 + greenStride;
        w0 = 1 - g;
        w1 = g - r;
        w2 = r - b;
        w3 = b;
      }

      for (let channel = 0; channel < 3; channel++) {
        const index = origin + channel;
        const mapped =
          values[index] * w0 +
          values[index + first] * w1 +
          values[index + second] * w2 +
          values[index + maximumOffset] * w3;
        const source = image.data[pixel + channel] / 255;
        image.data[pixel + channel] = Math.round(
          clamp(source + (mapped - source) * strength) * 255,
        );
      }
    }
  };
}

/** Apply tetrahedral 3D interpolation in encoded sRGB, retaining straight alpha. */
export function applyLut(image: LutPixels, lut: Lut3D, intensity: number): void {
  createLutTransform(lut, intensity)(image);
}
