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
