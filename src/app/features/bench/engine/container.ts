import type { Cicp } from '../models/bench.models';

// Canvas exports do not expose HDR metadata controls, so metadata is added to the encoded bytes.

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  let length = 0;
  for (const p of parts) length += p.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const ICC_MARKER = [
  0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00,
] as const; // Null-terminated ICC_PROFILE signature.
const MAX_ICC_CHUNK = 65519; // 65533 segment limit minus the 14-byte ICC header

function iccSegments(icc: Uint8Array): Uint8Array[] {
  // APP2 stores the sequence number and total count in one byte each.
  if (icc.length === 0 || icc.length > MAX_ICC_CHUNK * 255) {
    throw new RangeError('ICC profile must fit in 1 to 255 JPEG segments.');
  }
  const chunks = Math.ceil(icc.length / MAX_ICC_CHUNK);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < chunks; i++) {
    const slice = icc.subarray(i * MAX_ICC_CHUNK, (i + 1) * MAX_ICC_CHUNK);
    // The length includes its own two bytes and the 14-byte ICC chunk header.
    const length = slice.length + 16;
    parts.push(
      new Uint8Array([0xff, 0xe2, (length >> 8) & 255, length & 255, ...ICC_MARKER, i + 1, chunks]),
      slice,
    );
  }
  return parts;
}

// Replace APP1/APP2 metadata with one ICC profile, preserving JFIF and encoded pixels.
export function embedICCProfile(jpeg: Uint8Array, icc: Uint8Array): Uint8Array<ArrayBuffer> {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG stream');

  const segments = iccSegments(icc);
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let inserted = false;

  const insert = (): void => {
    if (!inserted) {
      parts.push(...segments);
      inserted = true;
    }
  };

  let i = 2;
  while (i < jpeg.length) {
    const start = i;
    if (jpeg[i] !== 0xff) throw new Error('Invalid JPEG marker.');
    // JPEG permits fill bytes before a marker; preserve them with retained segments.
    while (i < jpeg.length && jpeg[i] === 0xff) i++;
    if (i >= jpeg.length) throw new Error('Truncated JPEG marker.');
    const marker = jpeg[i++];
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9) {
      throw new Error('Unexpected JPEG marker before scan data.');
    }

    // Standalone markers have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(jpeg.subarray(start, i));
      continue;
    }
    if (i + 2 > jpeg.length) throw new Error('Truncated JPEG segment length.');
    const length = (jpeg[i] << 8) | jpeg[i + 1];
    const end = i + length;
    if (length < 2 || end > jpeg.length) throw new Error('Invalid JPEG segment length.');

    if (marker === 0xda) {
      // Validate the scan header boundary, then leave entropy-coded data and later scans opaque.
      if (
        jpeg[jpeg.length - 2] !== 0xff ||
        jpeg[jpeg.length - 1] !== 0xd9 ||
        end > jpeg.length - 2
      ) {
        throw new Error('JPEG scan is missing its end marker.');
      }
      insert();
      parts.push(jpeg.subarray(start));
      return concatBytes(parts);
    }
    if (marker === 0xe0) {
      parts.push(jpeg.subarray(start, end)); // Preserve JFIF before the new profile.
    } else if (marker !== 0xe1 && marker !== 0xe2) {
      insert();
      parts.push(jpeg.subarray(start, end));
    }
    // APP1 (EXIF/XMP) and APP2 (including the previous ICC profile) are omitted.
    i = end;
  }
  throw new Error('JPEG stream has no scan data.');
}

// PNG uses reflected CRC-32 over the chunk type and payload, excluding its length.
const CRC_TABLE: Uint32Array<ArrayBuffer> = ((): Uint32Array<ArrayBuffer> => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const IHDR = 0x49484452;
const IDAT = 0x49444154;
const IEND = 0x49454e44;
const PNG_CICP = 0x63494350;

// Replace all existing cICP chunks with one directly after IHDR, without re-encoding pixels.
// This checks container boundaries, not compressed image data or CRCs of retained chunks.
export function embedPNGCICP(png: Uint8Array, cicp: Readonly<Cicp>): Uint8Array<ArrayBuffer> {
  if (!PNG_SIGNATURE.every((byte, index) => png[index] === byte)) {
    throw new Error('Not a PNG stream');
  }
  if (
    ![cicp.colorPrimaries, cicp.transferCharacteristics].every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 255,
    ) ||
    cicp.matrixCoefficients !== 0 ||
    (cicp.videoFullRangeFlag !== 0 && cicp.videoFullRangeFlag !== 1)
  ) {
    throw new RangeError('Invalid PNG CICP code points.');
  }
  const payload = new Uint8Array([
    0x63,
    0x49,
    0x43,
    0x50, // 'cICP'
    cicp.colorPrimaries,
    cicp.transferCharacteristics,
    cicp.matrixCoefficients,
    cicp.videoFullRangeFlag,
  ]);

  const chunk = new Uint8Array(16);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 4);
  chunk.set(payload, 4);
  view.setUint32(12, crc32(payload));

  // Respect byteOffset because callers may pass a view into a larger buffer.
  const input = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let offset = 8;
  let hasImageData = false;
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error('Truncated PNG chunk.');
    const length = input.getUint32(offset);
    const type = input.getUint32(offset + 4);
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > png.length) throw new Error('Invalid PNG chunk length.');
    if (offset === 8) {
      if (type !== IHDR || length !== 13) throw new Error('PNG must start with a 13-byte IHDR.');
      parts.push(png.subarray(offset, end), chunk);
    } else {
      if (type === IHDR) throw new Error('Duplicate PNG IHDR.');
      if (type === PNG_CICP) {
        if (length !== 4) throw new Error('Invalid PNG cICP length.');
      } else {
        parts.push(png.subarray(offset, end));
      }
    }
    if (type === IDAT) hasImageData = true;
    if (type === IEND) {
      if (length !== 0 || end !== png.length || !hasImageData) {
        throw new Error('Invalid PNG end chunk or missing image data.');
      }
      return concatBytes(parts);
    }
    offset = end;
  }
  throw new Error('PNG stream has no end chunk.');
}

// Limit each spread to avoid the function argument limit on large images.
export function toDataURL(bytes: Uint8Array, mimeType: string): string {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}
