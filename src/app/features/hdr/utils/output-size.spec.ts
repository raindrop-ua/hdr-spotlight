import { DEFAULT_SETTINGS } from '@features/hdr/models/bench.models';
import { outputDimensions, outputSizeError } from './output-size';

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
