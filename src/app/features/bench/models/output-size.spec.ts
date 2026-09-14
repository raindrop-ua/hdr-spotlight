import { DEFAULT_SETTINGS } from './bench.models';
import { imagePlacement, outputDimensions, outputSizeError } from './output-size';

const source = { width: 600, height: 300 };

describe('Output geometry', () => {
  it('resolves presets, original dimensions and custom rectangles', () => {
    expect(outputDimensions(source, DEFAULT_SETTINGS)).toEqual({ width: 400, height: 400 });
    expect(outputDimensions(source, { ...DEFAULT_SETTINGS, size: 0 })).toEqual(source);
    expect(
      outputDimensions(source, {
        ...DEFAULT_SETTINGS,
        size: 'custom',
        customWidth: 900,
        customHeight: 500,
      }),
    ).toEqual({ width: 900, height: 500 });
  });

  it.each([
    [
      { width: 600, height: 300 },
      { x: 0, y: 100, width: 400, height: 200 },
    ],
    [
      { width: 300, height: 600 },
      { x: 100, y: 0, width: 200, height: 400 },
    ],
  ])('centers fitted artwork and stretches to the full canvas', (image, fitted) => {
    const target = { width: 400, height: 400 };
    expect(imagePlacement(image, target, true)).toEqual(fitted);
    expect(imagePlacement(image, target, false)).toEqual({ x: 0, y: 0, ...target });
  });

  it.each([null, 0, -1, 1.5, NaN, Infinity, 16385])(
    'rejects invalid sides before allocating a canvas: %s',
    (dimension) => {
      for (const axis of ['customWidth', 'customHeight']) {
        const settings = { ...DEFAULT_SETTINGS, size: 'custom' as const, [axis]: dimension };
        expect(outputSizeError(settings)).not.toBe('');
        expect(() => outputDimensions(source, settings)).toThrow(RangeError);
      }
    },
  );

  it('enforces pixel and side limits independently and ignores inactive custom fields', () => {
    expect(
      outputSizeError({
        ...DEFAULT_SETTINGS,
        size: 'custom',
        customWidth: 4096,
        customHeight: 4096,
      }),
    ).toBe('');
    expect(
      outputSizeError({
        ...DEFAULT_SETTINGS,
        size: 'custom',
        customWidth: 4097,
        customHeight: 4096,
      }),
    ).toContain('16 megapixels');
    expect(
      outputSizeError({ ...DEFAULT_SETTINGS, size: 'custom', customWidth: 16384, customHeight: 1 }),
    ).toBe('');
    expect(outputSizeError({ ...DEFAULT_SETTINGS, customWidth: null })).toBe('');
  });
});
