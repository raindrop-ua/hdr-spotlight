export const ICON_SIZES = [16, 32, 48, 64, 128, 256];

// A single PNG-backed icon. A zero dimension byte represents 256 pixels in ICO.
export function packIco(png: Uint8Array, size: number): Blob {
  if (!ICON_SIZES.includes(size)) throw new Error('Choose a supported icon size.');
  const header = new ArrayBuffer(22);
  const view = new DataView(header);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  view.setUint8(6, size === 256 ? 0 : size);
  view.setUint8(7, size === 256 ? 0 : size);
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  return new Blob([header, new Uint8Array(png)], { type: 'image/x-icon' });
}
