import { dimensionsError, linkedDimensions, imagePlacement } from './image-geometry';

describe('Shared image geometry', () => {
  it('rejects invalid and excessive dimensions', () => {
    for (const width of [0, -1, 1.5, NaN, Infinity, 16385])
      expect(dimensionsError({ width, height: 1 })).not.toBe('');
    expect(dimensionsError({ width: 4096, height: 4097 })).not.toBe('');
    expect(dimensionsError({ width: 4096, height: 4096 })).toBe('');
  });
  it('links both axes to the source aspect ratio', () => {
    const source = { width: 600, height: 300 };
    expect(linkedDimensions(source, 'width', 240)).toEqual({ width: 240, height: 120 });
    expect(linkedDimensions(source, 'height', 64)).toEqual({ width: 128, height: 64 });
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
});
