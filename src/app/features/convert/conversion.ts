export const FORMATS = [
  { id: 'webp', label: 'WebP', mime: 'image/webp', extension: 'webp' },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', extension: 'jpg' },
  { id: 'png', label: 'PNG', mime: 'image/png', extension: 'png' },
  { id: 'ico', label: 'ICO', mime: 'image/x-icon', extension: 'ico' },
  { id: 'bmp', label: 'BMP', mime: 'image/bmp', extension: 'bmp' },
] as const;
export type Format = (typeof FORMATS)[number]['id'];
export interface Dimensions {
  width: number;
  height: number;
}
export interface ConversionSettings {
  format: Format;
  quality: number;
  resize: boolean;
  width: number;
  height: number;
  locked: boolean;
  iconSize: number;
  background: string;
}
export const DEFAULT_CONVERSION: ConversionSettings = {
  format: 'webp',
  quality: 85,
  resize: false,
  width: 1024,
  height: 1024,
  locked: true,
  iconSize: 256,
  background: '#ffffff',
};
export const ICON_SIZES = [16, 32, 48, 64, 128, 256];
export function dimensionsError({ width, height }: Dimensions): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
    return 'Enter a whole number of pixels for both dimensions.';
  if (width > 16384 || height > 16384 || width * height > 16777216)
    return 'Use up to 16 megapixels and 16,384 pixels per side.';
  return '';
}
export function targetDimensions(source: Dimensions, settings: ConversionSettings): Dimensions {
  if (settings.format === 'ico') return { width: settings.iconSize, height: settings.iconSize };
  return settings.resize ? { width: settings.width, height: settings.height } : source;
}
export function linkedDimensions(
  source: Dimensions,
  side: 'width' | 'height',
  value: number,
): Dimensions {
  return side === 'width'
    ? { width: value, height: Math.max(1, Math.round((value * source.height) / source.width)) }
    : { width: Math.max(1, Math.round((value * source.width) / source.height)), height: value };
}

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

// Windows BITMAPINFOHEADER: 24-bit BGR, bottom-up rows padded to four bytes.
export function packBmp({
  width,
  height,
  data,
}: Pick<ImageData, 'width' | 'height' | 'data'>): Blob {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const buffer = new ArrayBuffer(54 + stride * height);
  const view = new DataView(buffer);
  view.setUint16(0, 0x4d42, true);
  view.setUint32(2, buffer.byteLength, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, stride * height, true);
  const bytes = new Uint8Array(buffer);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const target = 54 + (height - 1 - y) * stride + x * 3;
      bytes[target] = data[source + 2];
      bytes[target + 1] = data[source + 1];
      bytes[target + 2] = data[source];
    }
  }
  return new Blob([buffer], { type: 'image/bmp' });
}
