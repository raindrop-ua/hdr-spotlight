import {
  DEFAULT_CONVERSION,
  dimensionsError,
  linkedDimensions,
  packBmp,
  packIco,
  targetDimensions,
} from './conversion';

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

describe('Image conversion geometry and containers', () => {
  it('preserves the source dimensions unless resize is enabled, and overrides them for icons', () => {
    const source = { width: 600, height: 300 };
    expect(targetDimensions(source, DEFAULT_CONVERSION)).toEqual(source);
    expect(
      targetDimensions(source, { ...DEFAULT_CONVERSION, resize: true, width: 200, height: 100 }),
    ).toEqual({ width: 200, height: 100 });
    expect(
      targetDimensions(source, { ...DEFAULT_CONVERSION, format: 'ico', iconSize: 32 }),
    ).toEqual({ width: 32, height: 32 });
    expect(linkedDimensions(source, 'width', 240)).toEqual({ width: 240, height: 120 });
    expect(linkedDimensions(source, 'height', 64)).toEqual({ width: 128, height: 64 });
  });
  it('rejects invalid and excessive dimensions', () => {
    for (const width of [0, -1, 1.5, NaN, Infinity, 16385])
      expect(dimensionsError({ width, height: 1 })).not.toBe('');
    expect(dimensionsError({ width: 4096, height: 4097 })).not.toBe('');
    expect(dimensionsError({ width: 4096, height: 4096 })).toBe('');
  });
  it('writes a valid ICO directory pointing to an unchanged PNG payload', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const buffer = await readBlob(packIco(png, 256));
    const view = new DataView(buffer);
    expect(view.getUint16(0, true)).toBe(0);
    expect(view.getUint16(2, true)).toBe(1);
    expect(view.getUint16(4, true)).toBe(1);
    expect(view.getUint8(6)).toBe(0);
    expect(view.getUint8(7)).toBe(0);
    expect(view.getUint16(12, true)).toBe(32);
    expect(view.getUint32(14, true)).toBe(png.length);
    expect(view.getUint32(18, true)).toBe(22);
    expect(new Uint8Array(buffer, 22)).toEqual(png);
    expect(() => packIco(png, 512)).toThrow();
    expect(new DataView(await readBlob(packIco(png, 32))).getUint8(6)).toBe(32);
  });
  it('encodes BMP rows bottom-up in BGR order with four-byte alignment', async () => {
    const buffer = await readBlob(
      packBmp({
        width: 1,
        height: 2,
        data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
      }),
    );
    const view = new DataView(buffer);
    expect(view.getUint16(0, true)).toBe(0x4d42);
    expect(view.getUint32(2, true)).toBe(62);
    expect(view.getUint32(10, true)).toBe(54);
    expect(view.getUint16(28, true)).toBe(24);
    expect([...new Uint8Array(buffer, 54)]).toEqual([255, 0, 0, 0, 0, 0, 255, 0]);
  });
});
