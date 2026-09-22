import { packIco } from './ico';
import { packBmp } from './bmp';

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

describe('Image containers', () => {
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
