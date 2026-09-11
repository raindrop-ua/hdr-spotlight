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
  const chunks = Math.ceil(icc.length / MAX_ICC_CHUNK) || 1;
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
    if (jpeg[i] !== 0xff) break;
    const marker = jpeg[i + 1];

    // Standalone markers carry no payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }

    // Keep the scan header and all remaining bytes intact; marker parsing ends here.
    if (marker === 0xda) {
      insert();
      parts.push(jpeg.subarray(i));
      return concatBytes(parts);
    }

    const length = (jpeg[i + 2] << 8) | jpeg[i + 3];
    if (marker === 0xe0) {
      parts.push(jpeg.subarray(i, i + 2 + length)); // keep JFIF
    } else if (marker === 0xe1 || marker === 0xe2) {
      // Omit APP1 (EXIF/XMP) and APP2 (including any existing ICC profile).
    } else {
      insert();
      parts.push(jpeg.subarray(i, i + 2 + length));
    }
    i += 2 + length;
  }

  insert();
  return concatBytes(parts);
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

// The caller supplies a canvas PNG with IHDR first and no existing cICP chunk.
export function embedPNGCICP(png: Uint8Array, cicp: Readonly<Cicp>): Uint8Array<ArrayBuffer> {
  const ihdrLength = ((png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11]) >>> 0;
  // Skip the 8-byte signature plus IHDR length, type, payload and CRC.
  const insertAt = 8 + 12 + ihdrLength;

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

  return concatBytes([png.subarray(0, insertAt), chunk, png.subarray(insertAt)]);
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
