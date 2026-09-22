import { DEFAULT_CONVERSION } from '../models/conversion-defaults';
import { targetDimensions } from './conversion-dimensions';

describe('Conversion output dimensions', () => {
  it('preserves the source dimensions unless resize is enabled, and overrides them for icons', () => {
    const source = { width: 600, height: 300 };
    expect(targetDimensions(source, DEFAULT_CONVERSION)).toEqual(source);
    expect(
      targetDimensions(source, { ...DEFAULT_CONVERSION, resize: true, width: 200, height: 100 }),
    ).toEqual({ width: 200, height: 100 });
    expect(
      targetDimensions(source, { ...DEFAULT_CONVERSION, format: 'ico', iconSize: 32 }),
    ).toEqual({ width: 32, height: 32 });
  });
});
