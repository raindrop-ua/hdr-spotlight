import { pqOETF, pqOETFFast, smoothstep, nitsToCode, SRGB_TO_LINEAR } from './color';
import { encodeToPQ } from './encoder';
import type { PixelImage, PixelOptions } from '@features/hdr/models/bench.models';

const options: PixelOptions = { stops: 3, mode: 'whites', threshold: 0.8, dither: false };
const pixel = (): PixelImage => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([204, 204, 204, 255]),
});

describe('encoder boundaries', () => {
  it('uses an inclusive hard threshold when feather is zero', () => {
    expect(smoothstep(0.8, 0.8, 0.79)).toBe(0);
    expect(smoothstep(0.8, 0.8, 0.8)).toBe(1);
    expect(smoothstep(0.8, 0.8, 0.81)).toBe(1);
    const image = pixel();
    encodeToPQ(image, { ...options, feather: 0 });
    const expected = nitsToCode(SRGB_TO_LINEAR[204] * 203 * 8);
    expect(Array.from(image.data)).toEqual([expected, expected, expected, 255]);
  });

  it('handles a zero threshold without dividing by zero', () => {
    for (const mode of ['whites', 'bright'] as const) {
      const image = pixel();
      const stats = encodeToPQ(image, { ...options, mode, threshold: 0 });
      expect(stats.peakNits).toBeGreaterThan(900);
      expect(image.data[0]).toBeGreaterThan(0);
    }
  });

  it.each([
    { width: 0 },
    { width: -1 },
    { width: 1.5 },
    { height: Infinity },
    { height: NaN },
    { width: Number.MAX_SAFE_INTEGER },
    { data: new Uint8ClampedArray(3) },
    { data: new Uint8ClampedArray(8) },
  ])('rejects invalid image geometry before writing: %j', (patch) => {
    const image = { ...pixel(), ...patch };
    const before = image.data.slice();
    expect(() => encodeToPQ(image, options)).toThrow(RangeError);
    expect(image.data).toEqual(before);
  });

  it.each([
    { stops: NaN },
    { stops: Infinity },
    { stops: 1024 },
    { threshold: NaN },
    { threshold: -0.1 },
    { threshold: 1.1 },
    { feather: Infinity },
    { feather: -0.1 },
    { feather: 1.1 },
  ])('rejects invalid numeric settings before writing: %j', (patch) => {
    const image = pixel();
    const before = image.data.slice();
    expect(() => encodeToPQ(image, { ...options, ...patch })).toThrow(RangeError);
    expect(image.data).toEqual(before);
  });

  it.each(['{"mode":"other"}', '{"dither":1}', '{"preserveTransparency":"true"}'])(
    'rejects malformed runtime options: %s',
    (json) => {
      const patch: Partial<PixelOptions> = JSON.parse(json);
      const image = pixel();
      expect(() => encodeToPQ(image, { ...options, ...patch })).toThrow(TypeError);
      expect(image.data).toEqual(pixel().data);
    },
  );

  it('keeps dithered flat-field averages within half a 16-pixel quantization step', () => {
    // A full Bayer tile should round the average to the nearest 1/16 code value.
    // Use the red output channel of neutral input, whose conversion row sums to one.
    for (let value = 20; value <= 255; value++) {
      const data = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < data.length; i += 4) data.set([value, value, value, 255], i);
      encodeToPQ({ width: 4, height: 4, data }, { ...options, mode: 'all', dither: true });
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += data[i];
      const exact = 255 * pqOETF((SRGB_TO_LINEAR[value] * 8 * 203) / 10000);
      expect(Math.abs(sum / 16 - exact)).toBeLessThanOrEqual(1 / 32 + 0.005);
    }
  });
});

describe('PQ lookup accuracy', () => {
  it('stays within 0.005 of an 8-bit code across linear and logarithmic samples', () => {
    let maxError = 0;
    let previous = -1;
    let previousLogarithmic = -1;
    for (let i = 0; i <= 100000; i++) {
      const linear = i / 100000;
      const logarithmic = 10 ** (-12 + (12 * i) / 100000);
      for (const value of [linear, logarithmic]) {
        maxError = Math.max(maxError, 255 * Math.abs(pqOETFFast(value) - pqOETF(value)));
      }
      const encoded = pqOETFFast(linear);
      expect(encoded).toBeGreaterThanOrEqual(previous);
      previous = encoded;
      const encodedLogarithmic = pqOETFFast(logarithmic);
      expect(encodedLogarithmic).toBeGreaterThanOrEqual(previousLogarithmic);
      previousLogarithmic = encodedLogarithmic;
    }
    expect(maxError).toBeLessThan(0.005);
    expect(pqOETFFast(0)).toBe(pqOETF(0));
    expect(pqOETFFast(1)).toBe(1);
  });
});
